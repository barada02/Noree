from typing import Any, Literal

from pydantic import BaseModel, Field


class Viewport(BaseModel):
    width: int
    height: int


class Theme(BaseModel):
    background: str = "#0c0c0d"
    accent: str = "#e85d26"


class ContextPayload(BaseModel):
    prompt: str
    viewport: Viewport
    theme: Theme = Field(default_factory=Theme)
    params: dict[str, Any] = Field(default_factory=dict)
    scene: list[str] = Field(default_factory=list)
    perfTier: Literal["high", "low"] = "high"


class TestResult(BaseModel):
    passed: bool
    screenshot: str | None = None
    console: list[str] = Field(default_factory=list)
    error: str | None = None


class RegistryEntry(BaseModel):
    id: str
    version: int
    hash: str
    code: str
    preview: str | None = None
    context: ContextPayload
    status: Literal["draft", "approved"] = "draft"
