from transformers import pipeline
from typing import Optional
from app.models import MoodEnum


class MoodClassifier:
    def __init__(self):
        try:
            self.classifier = pipeline(
                "text-classification",
                model="j-hartmann/emotion-english-distilroberta-base",
                device=-1  # Use CPU, set to 0 for GPU
            )
            self.mood_mapping = {
                "joy": MoodEnum.HAPPY,
                "sadness": MoodEnum.SAD,
                "anger": MoodEnum.ENERGETIC,
                "fear": MoodEnum.DARK,
                "surprise": MoodEnum.ETHEREAL,
                "neutral": MoodEnum.CALM,
            }
            print("✅ Mood classifier loaded")
        except Exception as e:
            print(f"❌ Failed to load mood classifier: {e}")
            self.classifier = None

    async def classify_mood(self, lyrics_text: str) -> Optional[MoodEnum]:
        """Classify mood from lyrics text"""
        if not self.classifier or not lyrics_text:
            return MoodEnum.CALM  # Default

        try:
            # Truncate to max 512 tokens for the model
            truncated_text = lyrics_text[:512]

            result = self.classifier(truncated_text)
            detected_emotion = result[0]["label"].lower()

            # Map emotion to our mood enum
            mood = self.mood_mapping.get(detected_emotion, MoodEnum.CALM)
            print(f"✅ Classified mood as: {mood}")
            return mood
        except Exception as e:
            print(f"❌ Mood classification failed: {e}")
            return MoodEnum.CALM


# Global instance
mood_classifier = MoodClassifier()
