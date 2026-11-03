#!/usr/bin/env bash
# One-time AWS setup for the CI/CD pipeline. Run it in AWS CloudShell (us-east-1)
# while logged in to the account that owns the instance:
#   bash aws-bootstrap.sh
# Idempotent: safe to re-run.
set -euo pipefail

REGION=us-east-1
INSTANCE_ID=i-027dcf808e037b3b5
GITHUB_REPO=barada02/Noree
GITHUB_ENV=production

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="noree-deploy-$ACCOUNT"
INSTANCE_ROLE=noree-ec2-role
GH_ROLE=noree-github-deploy

echo "Account: $ACCOUNT  Bucket: $BUCKET"

# --- S3 bucket (private) ---
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-releases","Status":"Enabled","Filter":{"Prefix":"releases/"},"Expiration":{"Days":30}}]}'

# --- Instance role: SSM + read the bucket ---
aws iam get-role --role-name "$INSTANCE_ROLE" >/dev/null 2>&1 || aws iam create-role \
  --role-name "$INSTANCE_ROLE" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name "$INSTANCE_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "$INSTANCE_ROLE" --policy-name read-releases --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/releases/*\"}]}"

aws iam get-instance-profile --instance-profile-name "$INSTANCE_ROLE" >/dev/null 2>&1 || {
  aws iam create-instance-profile --instance-profile-name "$INSTANCE_ROLE"
  aws iam add-role-to-instance-profile --instance-profile-name "$INSTANCE_ROLE" --role-name "$INSTANCE_ROLE"
  sleep 10
}

CURRENT=$(aws ec2 describe-iam-instance-profile-associations --region "$REGION" \
  --filters Name=instance-id,Values="$INSTANCE_ID" Name=state,Values=associated \
  --query 'IamInstanceProfileAssociations[0].AssociationId' --output text)
if [ "$CURRENT" = "None" ]; then
  aws ec2 associate-iam-instance-profile --region "$REGION" --instance-id "$INSTANCE_ID" \
    --iam-instance-profile Name="$INSTANCE_ROLE"
else
  echo "Instance already has a profile ($CURRENT); leaving it. Make sure it has SSM + S3 read."
fi

# --- GitHub OIDC provider ---
OIDC_ARN="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1 || \
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# --- Role GitHub Actions assumes (locked to this repo's production environment) ---
TRUST="{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{
    \"Effect\":\"Allow\",
    \"Principal\":{\"Federated\":\"$OIDC_ARN\"},
    \"Action\":\"sts:AssumeRoleWithWebIdentity\",
    \"Condition\":{
      \"StringEquals\":{
        \"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\",
        \"token.actions.githubusercontent.com:sub\":\"repo:$GITHUB_REPO:environment:$GITHUB_ENV\"}}}]}"

if aws iam get-role --role-name "$GH_ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$GH_ROLE" --policy-document "$TRUST"
else
  aws iam create-role --role-name "$GH_ROLE" --assume-role-policy-document "$TRUST"
fi

aws iam put-role-policy --role-name "$GH_ROLE" --policy-name deploy --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/releases/*\"},
    {\"Effect\":\"Allow\",\"Action\":\"ssm:SendCommand\",\"Resource\":[
      \"arn:aws:ec2:$REGION:$ACCOUNT:instance/$INSTANCE_ID\",
      \"arn:aws:ssm:$REGION::document/AWS-RunShellScript\"]},
    {\"Effect\":\"Allow\",\"Action\":[\"ssm:GetCommandInvocation\",\"ssm:ListCommandInvocations\"],\"Resource\":\"*\"}
  ]}"

cat <<EOF

=== Add these as secrets in GitHub (Settings > Environments > production) ===
AWS_ROLE_ARN = arn:aws:iam::$ACCOUNT:role/$GH_ROLE
INSTANCE_ID  = $INSTANCE_ID
S3_BUCKET    = $BUCKET
EOF
