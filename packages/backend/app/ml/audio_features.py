import librosa
import numpy as np
from typing import Optional, Dict, List
import soundfile as sf


class AudioFeatureExtractor:
    """Extract audio features from MP3 files using librosa"""

    def __init__(self):
        print("✅ Audio feature extractor initialized")

    async def extract_features(self, audio_path: str, sr: int = 22050) -> Dict:
        """
        Extract comprehensive audio features from MP3 file

        Args:
            audio_path: Path to MP3 file
            sr: Sample rate (default 22050 Hz)

        Returns:
            Dict with tempo, energy envelope, spectral centroid, etc.
        """
        try:
            # Load audio
            y, sr = librosa.load(audio_path, sr=sr)

            # Tempo/BPM detection
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)

            # Energy envelope (RMS per frame)
            S = np.abs(librosa.stft(y))
            energy = librosa.feature.rms(S=S)[0]

            # Spectral centroid (brightness)
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

            # Zero crossing rate (noisiness)
            zcr = librosa.feature.zero_crossing_rate(y)[0]

            # Chroma features (pitch class distribution)
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            chroma_mean = np.mean(chroma, axis=1).tolist()  # 12-bin average

            # Spectral rolloff (frequency below which 85% of energy is concentrated)
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]

            # MFCC (Mel-frequency cepstral coefficients) - timbral texture
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            mfcc_mean = np.mean(mfcc, axis=1).tolist()

            # Energy statistics
            energy_mean = float(np.mean(energy))
            energy_std = float(np.std(energy))

            # Spectral statistics
            spectral_mean = float(np.mean(spectral_centroid))
            spectral_std = float(np.std(spectral_centroid))

            # ZCR statistics
            zcr_mean = float(np.mean(zcr))

            # Build energy envelope (0.5s window)
            hop_length = int(0.5 * sr)  # 0.5 second hops
            energy_envelope = []

            for i in range(0, len(y), hop_length):
                chunk = y[i : i + hop_length]
                if len(chunk) > 0:
                    rms = float(np.sqrt(np.mean(chunk**2)))
                    energy_envelope.append(rms)

            # Normalize energy envelope to 0-1
            if energy_envelope:
                max_energy = max(energy_envelope)
                if max_energy > 0:
                    energy_envelope = [e / max_energy for e in energy_envelope]

            # Convert tempo — newer librosa returns an ndarray
            tempo = float(np.atleast_1d(tempo)[0])

            result = {
                "tempo": tempo,
                "beats": beats.tolist() if len(beats) > 0 else [],
                "energy_mean": energy_mean,
                "energy_std": energy_std,
                "energy_envelope": energy_envelope[:200],  # Limit to 100 seconds (200 * 0.5)
                "spectral_centroid_mean": spectral_mean,
                "spectral_centroid_std": spectral_std,
                "spectral_centroid": (
                    spectral_centroid.tolist()[:100]
                    if len(spectral_centroid) > 0
                    else []
                ),
                "spectral_rolloff_mean": float(np.mean(spectral_rolloff)),
                "zero_crossing_rate": zcr_mean,
                "chroma": chroma_mean,
                "mfcc": mfcc_mean,
            }

            print(f"✅ Features extracted: BPM={tempo:.1f}, energy={energy_mean:.3f}")
            return result

        except Exception as e:
            print(f"❌ Feature extraction failed: {e}")
            return {
                "tempo": None,
                "beats": [],
                "energy_mean": 0.5,
                "energy_std": 0.0,
                "energy_envelope": [],
                "spectral_centroid_mean": None,
                "spectral_centroid_std": None,
                "spectral_centroid": [],
                "spectral_rolloff_mean": None,
                "zero_crossing_rate": None,
                "chroma": [0.0] * 12,
                "mfcc": [0.0] * 13,
            }


# Global instance
audio_feature_extractor = AudioFeatureExtractor()
