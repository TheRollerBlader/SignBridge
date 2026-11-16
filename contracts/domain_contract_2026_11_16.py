"""Strict type-safe ASL hand landmark tensor contract for SignBridge.
Scheduled Milestone: Architecture & Scaffolding (2026-11-16).
"""

from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


class LandmarkPoint3D(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0, description="Normalized X coordinate")
    y: float = Field(..., ge=0.0, le=1.0, description="Normalized Y coordinate")
    z: float = Field(..., description="Camera-relative depth Z")


class ASLLandmarkTensorContract(BaseModel):
    """Guarantees strict 21-keypoint MediaPipe hand landmark topology."""
    milestone_date: str = Field(default="2026-11-16")
    frame_index: int = Field(default=0, ge=0)
    landmarks: List[LandmarkPoint3D] = Field(..., min_length=21, max_length=21)
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_spatial_bounds(self) -> "ASLLandmarkTensorContract":
        if self.confidence < 0.3:
            raise ValueError("Inference confidence below minimum tracking threshold (0.3)")
        return self
