import argparse
import sys
import zipfile
import shutil
from pathlib import Path
from typing import Optional, List

import cv2  # pyright: ignore[reportMissingImports]
import numpy as np

class VideoConverter:
    def __init__(self, input_path: str, output_name: Optional[str] = None, 
                    fps: Optional[float] = None, output_dir: Optional[str] = None):
        """
        Initialize the converter with input and output paths.
        """
        self.input_path = Path(input_path)
        if not self.input_path.exists():
            raise FileNotFoundError(f"未找到视频文件: {input_path}")
            
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            self.output_dir = self.input_path.parent / "output"
        
        self.output_dir.mkdir(exist_ok=True, parents=True)
        self.fps = fps or 1.0
        
        # Set output ZIP path
        if output_name:
            path = Path(output_name)
            if path.is_absolute():
                self.output_zip = path if path.suffix == '.zip' else path.with_suffix('.zip')
            else:
                name = output_name if output_name.endswith('.zip') else f"{output_name}.zip"
                self.output_zip = self.output_dir / name
        else:
            self.output_zip = self.output_dir / f"{self.input_path.stem}_frames.zip"
        
        self.temp_dir = self.output_dir / f"{self.input_path.stem}_temp"

    def process(self, keep_temp: bool = False, no_zip: bool = False):
        try:
            frames = self._extract_frames()
            if frames:
                if not no_zip:
                    self._create_zip(frames)
                    if not keep_temp:
                        self._cleanup()
                else:
                    print(f"TEMP_DIR:{self.temp_dir}", flush=True)
            else:
                raise ValueError("没有提取到任何帧。")
        except Exception as e:
            print(f"ERROR:{e}", file=sys.stderr)
            self._cleanup()
            sys.exit(1)

    def _extract_frames(self) -> List[Path]:
        self.temp_dir.mkdir(exist_ok=True, parents=True)
        
        cap = cv2.VideoCapture(str(self.input_path))
        if not cap.isOpened():
            raise ValueError("无法打开视频文件。")
            
        v_fps = cap.get(cv2.CAP_PROP_FPS)
        v_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if v_fps <= 0:
            v_fps = 30.0 # Fallback
            
        interval = max(1, int(v_fps / self.fps))
        target_count = v_total // interval if interval > 0 else v_total

        frame_paths = []
        count = 0
        saved = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            if count % interval == 0:
                out_path = self.temp_dir / f"frame_{saved:05d}.png"
                result, buf = cv2.imencode(".png", frame)
                if result:
                    with open(out_path, "wb") as f:
                        f.write(buf)
                frame_paths.append(out_path)
                saved += 1
                
                if target_count > 0:
                    progress_val = min(100, int((saved / target_count) * 100))
                    print(f"PROGRESS:{progress_val}", flush=True)
            
            count += 1
                
        cap.release()
        return frame_paths

    def _create_zip(self, files: List[Path]):
        with zipfile.ZipFile(self.output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, f in enumerate(files):
                zf.write(f, arcname=f.name)

    def _cleanup(self):
        if hasattr(self, 'temp_dir') and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

def main():
    if sys.platform == "win32":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

    parser = argparse.ArgumentParser(description="MP4 to PNG Converter (Backend)")
    parser.add_argument("input", help="Path to the input video file")
    parser.add_argument("-o", "--output", help="Output filename or path")
    parser.add_argument("-f", "--fps", type=float, help="Frames per second to extract")
    parser.add_argument("-k", "--keep", action="store_true", help="Keep temporary PNG files")
    parser.add_argument("--no-zip", action="store_true", help="Only extract frames, do not create ZIP")
    parser.add_argument("--output-dir", help="Directory for temporary and final output")
    parser.add_argument("--info", action="store_true", help="Get video info (duration, fps, total_frames)")
    
    args = parser.parse_args()
    
    try:
        if args.info:
            cap = cv2.VideoCapture(str(args.input))
            if not cap.isOpened():
                raise ValueError("无法打开视频文件。")
            fps = cap.get(cv2.CAP_PROP_FPS)
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            dur = total / fps if fps > 0 else 0
            print(f"{dur},{fps},{total}", flush=True)
            cap.release()
            sys.exit(0)

        converter = VideoConverter(
            input_path=args.input,
            output_name=args.output,
            fps=args.fps,
            output_dir=args.output_dir
        )
        converter.process(keep_temp=args.keep, no_zip=args.no_zip)
    except Exception as e:
        print(f"ERROR:{e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
