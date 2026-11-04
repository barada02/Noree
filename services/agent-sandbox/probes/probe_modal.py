import modal

app = modal.App.lookup("agent-sandbox", create_if_missing=True)
image = modal.Image.debian_slim(python_version="3.12")
sb = modal.Sandbox.create(app=app, image=image, timeout=120)
try:
    p = sb.exec("python", "-c", "print('hello-from-sandbox')")
    p.wait()
    print("stdout:", p.stdout.read())
    print("returncode:", p.returncode)
finally:
    sb.terminate()
print("PROBE_OK")
