import argparse
import sys
import zipfile
import shutil
from pathlib import Path
from typing import Optional, List

import cv2  # pyright: ignore[reportMissingImports]
from display import Display

class VideoConverter:
    def __init__(self, input_name: Optional[str] = None, output_name: Optional[str] = None, 
                 fps: Optional[float] = None, total_frames: Optional[int] = None):
        """
        Initialize the converter with input and output paths.
        """
        self.base_dir = Path(__file__).parent.absolute()
        self.input_dir = self.base_dir / "video"
        self.output_dir = self.base_dir / "output"
        
        # Ensure directories exist
        self.input_dir.mkdir(exist_ok=True)
        self.output_dir.mkdir(exist_ok=True)
        
        self.input_path: Optional[Path] = None
        if input_name:
            self.input_path = self._resolve_input(input_name)
        
        self.output_zip: Optional[Path] = None
        if self.input_path:
            self._set_output_path(output_name)
            
        self.fps = fps
        self.total_frames = total_frames

    def _resolve_input(self, name: str) -> Path:
        """Find the input file in the video directory or direct path."""
        path = Path(name)
        if path.exists():
            return path
        
        video_folder_path = self.input_dir / name
        if video_folder_path.exists():
            return video_folder_path
            
        raise FileNotFoundError(f"Video file not found: {name}")

    def _set_output_path(self, output_name: Optional[str]):
        """Set the output ZIP path based on input path and user preference."""
        if not self.input_path:
            return
            
        if output_name:
            name = output_name if output_name.endswith('.zip') else f"{output_name}.zip"
            self.output_zip = self.output_dir / name
        else:
            self.output_zip = self.output_dir / f"{self.input_path.stem}_frames.zip"
        
        self.temp_dir = self.output_dir / f"{self.input_path.stem}_temp"

    def interactive_setup(self):
        """Guide the user through setup interactively."""
        Display.show_header()
        
        # 1. Select File
        video_files = sorted(list(self.input_dir.glob("*.mp4")))
        if not video_files:
            raise FileNotFoundError(f"No .mp4 files found in {self.input_dir}")
        
        self.input_path = Display.ask_file_selection(video_files)
        
        # 2. Select Mode
        mode = Display.ask_extraction_mode()
        if mode == "2":
            self.fps = Display.ask_fps()
        elif mode == "3":
            self.total_frames = Display.ask_total_frames()
            
        # 3. Output Name
        default_out = f"{self.input_path.stem}_frames.zip"
        output_name = Display.ask_output_name(default_out)
        self._set_output_path(output_name)

    def process(self, keep_temp: bool = False):
        """Execute the full conversion process."""
        if not self.input_path:
            self.interactive_setup()
            
        # If still no input path, something went wrong
        if not self.input_path or not self.output_zip:
            return

        if not hasattr(self, 'temp_dir'):
            self.temp_dir = self.output_dir / f"{self.input_path.stem}_temp"

        mode_str = "Total Frames" if self.total_frames else "FPS" if self.fps else "Full Extract"
        target_val = self.total_frames if self.total_frames else self.fps if self.fps else "All"
        
        # If we just did interactive setup, the header is already shown
        if len(sys.argv) > 1:
            Display.show_header()
            
        Display.show_video_info(self.input_path, self.output_zip, mode_str, target_val)
        
        try:
            frames = self._extract_frames()
            if frames:
                self._create_zip(frames)
                if not keep_temp:
                    self._cleanup()
                Display.show_success(self.output_zip)
            else:
                Display.show_error("No frames were extracted.")
        except Exception as e:
            Display.show_error(str(e))
            self._cleanup()
            sys.exit(1)

    def _extract_frames(self) -> List[Path]:
        """Extract frames from video based on FPS or total count."""
        self.temp_dir.mkdir(exist_ok=True, parents=True)
        
        cap = cv2.VideoCapture(str(self.input_path))
        if not cap.isOpened():
            raise ValueError("Failed to open video file.")
            
        v_fps = cap.get(cv2.CAP_PROP_FPS)
        v_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if self.total_frames:
            interval = max(1, v_total // self.total_frames)
            target_count = self.total_frames
        elif self.fps:
            interval = max(1, int(v_fps / self.fps))
            target_count = v_total // interval
        else:
            interval = 1
            target_count = v_total

        frame_paths = []
        count = 0
        saved = 0
        
        with Display.create_progress() as progress:
            task = progress.add_task("[cyan]Extracting frames...", total=target_count)
            
            while True:
                ret, frame = cap.read()
                if not ret or (self.total_frames and saved >= self.total_frames):
                    break
                
                if count % interval == 0:
                    out_path = self.temp_dir / f"frame_{saved:05d}.png"
                    cv2.imwrite(str(out_path), frame)
                    frame_paths.append(out_path)
                    saved += 1
                    progress.update(task, advance=1)
                
                count += 1
                
        cap.release()
        return frame_paths

    def _create_zip(self, files: List[Path]):
        """Compress extracted PNGs into a zip archive."""
        with Display.create_progress() as progress:
            task = progress.add_task("[magenta]Packing ZIP...", total=len(files))
            
            with zipfile.ZipFile(self.output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    zf.write(f, arcname=f.name)
                    progress.update(task, advance=1)

    def _cleanup(self):
        """Remove temporary frame directory."""
        if hasattr(self, 'temp_dir') and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

def main():
    parser = argparse.ArgumentParser(description="MP4 to PNG Zip Converter")
    parser.add_argument("input", nargs="?", help="Video filename in 'video/' or direct path")
    parser.add_argument("-o", "--output", help="Output filename (saved in 'output/')")
    parser.add_argument("-f", "--fps", type=float, help="Frames per second to extract")
    parser.add_argument("-n", "--frames", type=int, help="Total frames to extract")
    parser.add_argument("-k", "--keep", action="store_true", help="Keep temporary PNG files")
    
    args = parser.parse_args()
    
    try:
        converter = VideoConverter(
            input_name=args.input,
            output_name=args.output,
            fps=args.fps,
            total_frames=args.frames
        )
        converter.process(keep_temp=args.keep)
    except Exception as e:
        Display.show_error(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
