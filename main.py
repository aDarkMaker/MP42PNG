import argparse
import sys
import zipfile
import shutil
from pathlib import Path
from typing import Optional, List

import cv2  # pyright: ignore[reportMissingImports]
import numpy as np
from display import Display

class VideoConverter:
    def __init__(self, input_name: Optional[str] = None, output_name: Optional[str] = None, 
                    fps: Optional[float] = None, output_dir: Optional[str] = None):
        """
        Initialize the converter with input and output paths.
        """
        self.base_dir = Path(__file__).parent.absolute()
        self.input_dir = self.base_dir / "video"
        
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            self.output_dir = self.base_dir / "output"
        
        self.input_dir.mkdir(exist_ok=True)
        self.output_dir.mkdir(exist_ok=True, parents=True)
        
        self.input_path: Optional[Path] = None
        if input_name:
            self.input_path = self._resolve_input(input_name)
        
        self.output_zip: Optional[Path] = None
        if self.input_path:
            self._set_output_path(output_name)
            
        self.fps = fps

    def _resolve_input(self, name: str) -> Path:
        """Find the input file in the video directory or direct path."""
        path = Path(name)
        if path.exists():
            return path
        
        video_folder_path = self.input_dir / name
        if video_folder_path.exists():
            return video_folder_path
            
        raise FileNotFoundError(f"未找到视频文件: {name}")

    def _set_output_path(self, output_name: Optional[str]):
        """Set the output ZIP path based on input path and user preference."""
        if not self.input_path:
            return
            
        if output_name:
            path = Path(output_name)
            if path.is_absolute():
                self.output_zip = path if path.suffix == '.zip' else path.with_suffix('.zip')
                self.output_dir = self.output_zip.parent
            else:
                name = output_name if output_name.endswith('.zip') else f"{output_name}.zip"
                self.output_zip = self.output_dir / name
        else:
            self.output_zip = self.output_dir / f"{self.input_path.stem}_frames.zip"
        
        self.temp_dir = self.output_dir / f"{self.input_path.stem}_temp"

    def interactive_setup(self):
        Display.show_header()
        
        video_files = sorted(list(self.input_dir.glob("*.mp4")))
        if not video_files:
            raise FileNotFoundError(f"在 {self.input_dir} 文件夹中没有找到 .mp4 文件")
        
        self.input_path = Display.ask_file_selection(video_files)
        
        self.fps = Display.ask_fps()
            
        default_out = f"{self.input_path.stem}_frames.zip"
        output_name = Display.ask_output_name(default_out)
        self._set_output_path(output_name)

    def process(self, keep_temp: bool = False, no_zip: bool = False):
        if not self.input_path:
            self.interactive_setup()
            
        if not self.input_path or not self.output_zip:
            return

        if not hasattr(self, 'temp_dir'):
            self.temp_dir = self.output_dir / f"{self.input_path.stem}_temp"

        if len(sys.argv) > 1 and not no_zip:
            Display.show_header()
            
        if not no_zip:
            Display.show_video_info(self.input_path, self.output_zip, self.fps or 1.0)
        
        try:
            frames = self._extract_frames(show_progress=not no_zip)
            if frames:
                if not no_zip:
                    self._create_zip(frames)
                    if not keep_temp:
                        self._cleanup()
                    Display.show_success(self.output_zip)
                else:
                    print(f"TEMP_DIR:{self.temp_dir}")
            else:
                if not no_zip:
                    Display.show_error("没有提取到任何帧。")
        except Exception as e:
            if not no_zip:
                Display.show_error(str(e))
            else:
                print(f"ERROR:{e}", file=sys.stderr)
            self._cleanup()
            sys.exit(1)

    def _extract_frames(self, show_progress: bool = True) -> List[Path]:
        self.temp_dir.mkdir(exist_ok=True, parents=True)
        
        cap = cv2.VideoCapture(str(self.input_path))
        if not cap.isOpened():
            raise ValueError("无法打开视频文件。")
            
        v_fps = cap.get(cv2.CAP_PROP_FPS)
        v_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        target_fps = self.fps or 1.0
        interval = max(1, int(v_fps / target_fps))
        target_count = v_total // interval

        frame_paths = []
        count = 0
        saved = 0
        
        if show_progress:
            with Display.create_progress() as progress:
                task = progress.add_task("[cyan]正在提取视频帧...", total=target_count)
                
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
                        progress.update(task, advance=1)
                    
                    count += 1
        else:
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
                    
                    progress_val = int((saved / target_count) * 100)
                    print(f"PROGRESS:{progress_val}", flush=True)
                
                count += 1
                
        cap.release()
        return frame_paths

    def _create_zip(self, files: List[Path]):
        with Display.create_progress() as progress:
            task = progress.add_task("[magenta]正在打包 ZIP 文件...", total=len(files))
            
            with zipfile.ZipFile(self.output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    zf.write(f, arcname=f.name)
                    progress.update(task, advance=1)

    def _cleanup(self):
        if hasattr(self, 'temp_dir') and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

def main():
    if sys.platform == "win32":
        import os
        os.environ["PYTHONIOENCODING"] = "utf-8"

    parser = argparse.ArgumentParser(description="MP4 to PNG Zip Converter")
    parser.add_argument("input", nargs="?", help="Video filename in 'video/' or direct path")
    parser.add_argument("-o", "--output", help="Output filename (saved in 'output/')")
    parser.add_argument("-f", "--fps", type=float, help="Frames per second to extract")
    parser.add_argument("-k", "--keep", action="store_true", help="Keep temporary PNG files")
    parser.add_argument("--no-zip", action="store_true", help="Only extract frames, do not create ZIP")
    parser.add_argument("--output-dir", help="Directory for temporary and final output")
    
    args = parser.parse_args()
    
    try:
        converter = VideoConverter(
            input_name=args.input,
            output_name=args.output,
            fps=args.fps,
            output_dir=args.output_dir
        )
        converter.process(keep_temp=args.keep, no_zip=args.no_zip)
    except Exception as e:
        Display.show_error(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
