from pydantic import BaseModel, ConfigDict, Field, field_validator


class ScriptRequest(BaseModel):
    script: str = Field(min_length=1, max_length=30000)

    @field_validator("script")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("script must contain text")
        return value.strip()


class ScriptIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    original: str = Field(min_length=1)
    problem: str = Field(min_length=1)
    suggestion: str = Field(min_length=1)


class ScriptAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    original_script: str = Field(min_length=1)
    issues: list[ScriptIssue]
    improved_script: str = Field(min_length=1)

    @field_validator("original_script", "improved_script")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("improved_script must contain text")
        return value.strip()
