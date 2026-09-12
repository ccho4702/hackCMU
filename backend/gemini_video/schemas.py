from pydantic import BaseModel, ConfigDict, Field


class VideoIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_time: str = Field(pattern=r"^\d{2}:[0-5]\d\.\d{3}$")
    end_time: str = Field(pattern=r"^\d{2}:[0-5]\d\.\d{3}$")
    content: str = Field(min_length=1)


class DeliveryAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nonverbal_feedback: list[VideoIssue]
    vocal_feedback: list[VideoIssue]
