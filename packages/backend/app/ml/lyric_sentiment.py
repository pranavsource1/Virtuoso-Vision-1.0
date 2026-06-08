from typing import List, Dict
import re


class LyricSentimentAnalyzer:
    """Analyze sentiment and intensity of lyrics using fast keyword-based approach.
    
    Uses curated word lists instead of a 1.6GB transformer model.
    Results are comparable for music lyrics and run in <1ms per segment.
    """

    # Sentiment word lists
    POSITIVE_WORDS = {
        "love", "happy", "joy", "beautiful", "amazing", "wonderful", "perfect",
        "smile", "laugh", "dance", "shine", "light", "hope", "dream", "free",
        "fly", "alive", "paradise", "heaven", "glory", "blessed", "magic",
        "forever", "celebrate", "sun", "star", "bright", "warm", "sweet",
        "good", "great", "best", "better", "rise", "soar", "peace", "kind",
        "gentle", "golden", "angel", "divine", "bliss", "delight", "grateful",
        "trust", "faith", "strong", "power", "victory", "win", "triumph",
    }

    NEGATIVE_WORDS = {
        "hate", "sad", "pain", "hurt", "cry", "die", "death", "dark",
        "break", "broken", "lost", "alone", "lonely", "fear", "scared",
        "destroy", "fall", "fail", "ugly", "terrible", "worst", "bad",
        "never", "gone", "end", "burn", "bleed", "suffer", "sorrow",
        "grief", "mourn", "regret", "shame", "guilt", "anger", "rage",
        "hell", "damn", "curse", "poison", "drown", "empty", "hollow",
        "cold", "frozen", "numb", "waste", "ruin", "torn", "shatter",
        "betray", "lie", "fake", "wrong", "sick", "kill", "war", "fight",
    }

    INTENSITY_WORDS = {
        "love": 0.3, "hate": 0.4, "amazing": 0.3, "terrible": 0.35,
        "forever": 0.2, "never": 0.2, "always": 0.1, "die": 0.4,
        "break": 0.3, "destroy": 0.4, "beautiful": 0.3, "ugly": 0.35,
        "perfect": 0.3, "fail": 0.3, "cry": 0.3, "pain": 0.35,
        "joy": 0.3, "sorrow": 0.35, "explode": 0.4, "soar": 0.3,
        "scream": 0.4, "fire": 0.3, "blood": 0.35, "heart": 0.2,
    }

    def __init__(self):
        print("✅ Lyric sentiment analyzer initialized (keyword-based)")

    def _classify_sentiment(self, text: str) -> tuple:
        """Classify sentiment using word matching. Returns (sentiment, score)."""
        if not text:
            return "neutral", 0.5

        words = set(re.findall(r'[a-zA-Z]+', text.lower()))

        pos_count = len(words & self.POSITIVE_WORDS)
        neg_count = len(words & self.NEGATIVE_WORDS)
        total = pos_count + neg_count

        if total == 0:
            return "neutral", 0.5

        if pos_count > neg_count:
            score = min(0.95, 0.5 + (pos_count - neg_count) / (total + 2) * 0.5)
            return "positive", score
        elif neg_count > pos_count:
            score = min(0.95, 0.5 + (neg_count - pos_count) / (total + 2) * 0.5)
            return "negative", score
        else:
            return "neutral", 0.5

    def _calculate_intensity(self, text: str) -> float:
        """Calculate intensity score (0-1) based on linguistic features."""
        if not text:
            return 0.0

        intensity = 0.0

        # All caps = intense
        if text.isupper() and len(text) > 2:
            intensity += 0.3

        # Exclamation marks
        intensity += min(0.2, text.count("!") * 0.1)

        # Question marks
        intensity += min(0.1, text.count("?") * 0.05)

        # Emotion intensity words
        text_lower = text.lower()
        for word, score in self.INTENSITY_WORDS.items():
            if word in text_lower:
                intensity += score

        # Repetition patterns
        if "..." in text:
            intensity += 0.1
        if any(c * 3 in text_lower for c in "aeiou"):
            intensity += 0.1

        return min(1.0, intensity)

    async def analyze_lyrics(self, lyrics_segments: List[Dict]) -> List[Dict]:
        """Analyze sentiment for each lyric segment. Fast keyword-based approach."""
        if not lyrics_segments:
            return []

        results = []
        for segment in lyrics_segments:
            text = segment.get("text", "")
            timestamp = segment.get("timestamp", 0.0)
            confidence = segment.get("confidence", 0.9)

            sentiment, sentiment_score = self._classify_sentiment(text)
            intensity = self._calculate_intensity(text)

            results.append({
                "text": text,
                "timestamp": timestamp,
                "sentiment": sentiment,
                "intensity": intensity,
                "sentiment_score": float(sentiment_score),
                "confidence": confidence,
            })

        print(f"✅ Analyzed {len(results)} lyric segments for sentiment")
        return results


# Global instance
lyric_sentiment_analyzer = LyricSentimentAnalyzer()
