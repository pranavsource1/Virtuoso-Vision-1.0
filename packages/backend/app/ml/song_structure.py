import librosa
import numpy as np
from typing import List, Dict
from sklearn.cluster import KMeans


class SongStructureDetector:
    """Detect song sections (verse, chorus, bridge, outro) from audio energy patterns"""

    def __init__(self):
        print("✅ Song structure detector initialized")

    async def detect_sections(self, audio_path: str, sr: int = 22050) -> Dict:
        """
        Detect song sections from audio features

        Args:
            audio_path: Path to MP3 file
            sr: Sample rate

        Returns:
            Dict with detected sections and energy analysis
        """
        try:
            # Load audio
            y, sr = librosa.load(audio_path, sr=sr)
            duration = librosa.get_duration(y=y, sr=sr)

            # Compute spectral centroid over time
            S = np.abs(librosa.stft(y))
            energy = librosa.feature.rms(S=S)[0]

            # Get frame times
            frames = np.arange(len(energy))
            times = librosa.frames_to_time(frames, sr=sr)

            # Resample to 1-second intervals for section detection
            sec_frames = librosa.time_to_frames(np.arange(0, duration, 1.0), sr=sr)
            sec_energy = np.array([
                np.mean(energy[max(0, f - 2048):min(len(energy), f + 2048)])
                for f in sec_frames
            ])

            # Normalize energy
            if len(sec_energy) > 0:
                sec_energy = (sec_energy - np.min(sec_energy)) / (
                    np.max(sec_energy) - np.min(sec_energy) + 1e-6
                )

            # Detect energy changes (structure boundaries)
            energy_diff = np.diff(sec_energy)
            change_threshold = np.std(energy_diff) * 1.5

            # Find significant energy changes
            change_indices = np.where(np.abs(energy_diff) > change_threshold)[0]

            # Cluster sections into groups
            if len(sec_energy) < 4:
                # Too short, assume single section
                sections = [{
                    "section_type": "verse",
                    "start_time": 0.0,
                    "end_time": duration,
                    "energy_level": float(np.mean(sec_energy)),
                    "confidence": 0.5,
                }]
            else:
                # K-means clustering to identify distinct sections
                n_clusters = min(4, max(2, len(change_indices) + 1))
                X = sec_energy.reshape(-1, 1)
                kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
                labels = kmeans.fit_predict(X)

                # Map clusters to section types based on energy
                cluster_energies = [
                    np.mean(sec_energy[labels == i]) for i in range(n_clusters)
                ]
                sorted_clusters = sorted(
                    enumerate(cluster_energies), key=lambda x: x[1]
                )

                # Section type mapping: low energy = verse, high = chorus, etc
                section_types = {}
                if len(sorted_clusters) >= 3:
                    section_types[sorted_clusters[0][0]] = "verse"
                    section_types[sorted_clusters[-1][0]] = "chorus"
                    if len(sorted_clusters) >= 3:
                        section_types[sorted_clusters[1][0]] = "bridge"
                    if len(sorted_clusters) >= 4:
                        section_types[sorted_clusters[2][0]] = "outro"
                else:
                    section_types = {0: "verse", 1: "chorus"}
                    if len(section_types) < n_clusters:
                        for i in range(len(section_types), n_clusters):
                            section_types[i] = "bridge"

                # Group consecutive frames with same label
                sections = []
                current_label = labels[0]
                start_idx = 0

                for idx in range(1, len(labels)):
                    if labels[idx] != current_label:
                        start_time = start_idx * 1.0
                        end_time = idx * 1.0
                        avg_energy = np.mean(sec_energy[start_idx:idx])
                        section_type = section_types.get(current_label, "verse")

                        sections.append({
                            "section_type": section_type,
                            "start_time": float(start_time),
                            "end_time": float(end_time),
                            "energy_level": float(avg_energy),
                            "confidence": 0.75,
                        })

                        current_label = labels[idx]
                        start_idx = idx

                # Add final section
                if start_idx < len(labels):
                    start_time = start_idx * 1.0
                    avg_energy = np.mean(sec_energy[start_idx:])
                    section_type = section_types.get(current_label, "verse")

                    sections.append({
                        "section_type": section_type,
                        "start_time": float(start_time),
                        "end_time": float(duration),
                        "energy_level": float(avg_energy),
                        "confidence": 0.75,
                    })

            # Ensure no gaps
            for i in range(len(sections) - 1):
                if sections[i]["end_time"] < sections[i + 1]["start_time"]:
                    sections[i]["end_time"] = sections[i + 1]["start_time"]

            result = {
                "sections": sections,
                "total_duration": float(duration),
                "section_count": len(sections),
                "average_energy": float(np.mean(sec_energy)) if len(sec_energy) > 0 else 0.5,
            }

            section_str = ", ".join([f"{s['section_type']}" for s in sections])
            print(f"✅ Detected sections: {section_str} (duration: {duration:.1f}s)")
            return result

        except Exception as e:
            print(f"❌ Structure detection failed: {e}")
            duration = 180.0  # Default to 3 minutes
            return {
                "sections": [
                    {"section_type": "verse", "start_time": 0.0, "end_time": 45.0, "energy_level": 0.4, "confidence": 0.3},
                    {"section_type": "chorus", "start_time": 45.0, "end_time": 90.0, "energy_level": 0.7, "confidence": 0.3},
                    {"section_type": "bridge", "start_time": 90.0, "end_time": 135.0, "energy_level": 0.6, "confidence": 0.3},
                    {"section_type": "outro", "start_time": 135.0, "end_time": duration, "energy_level": 0.3, "confidence": 0.3},
                ],
                "total_duration": duration,
                "section_count": 4,
                "average_energy": 0.5,
            }


# Global instance
song_structure_detector = SongStructureDetector()
