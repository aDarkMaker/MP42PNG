from rich.console import Console  # pyright: ignore[reportMissingImports]
from rich.panel import Panel  # pyright: ignore[reportMissingImports]
from rich.table import Table  # pyright: ignore[reportMissingImports]
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeRemainingColumn  # pyright: ignore[reportMissingImports]
from rich.theme import Theme  # pyright: ignore[reportMissingImports]
from rich.prompt import Prompt, IntPrompt, FloatPrompt  # pyright: ignore[reportMissingImports]
from pathlib import Path
from typing import List, Optional

# Custom theme for the application
custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "highlight": "magenta",
})

console = Console(theme=custom_theme)

class Display:
    @staticmethod
    def show_header():
        """Displays the application header."""
        header_text = "[bold magenta]MP4[/bold magenta] [white]to[/white] [bold cyan]PNG[/bold cyan] [italic white]Converter[/italic white]"
        console.print(Panel(header_text, subtitle="[gray]Efficient Frame Extraction[/gray]", expand=False))

    @staticmethod
    def show_video_info(input_path: Path, output_path: Path, mode: str, target: float):
        """Displays video and conversion settings in a table."""
        table = Table(show_header=False, box=None)
        table.add_row("[info]Input File:[/info]", f"[white]{input_path.name}[/white]")
        table.add_row("[info]Output ZIP:[/info]", f"[white]{output_path.name}[/white]")
        table.add_row("[info]Mode:[/info]", f"[highlight]{mode}[/highlight]")
        table.add_row("[info]Target:[/info]", f"[white]{target}[/white]")
        
        console.print(Panel(table, title="[bold white]Settings[/bold white]", border_style="blue", expand=False))

    @staticmethod
    def show_error(message: str):
        """Displays an error message."""
        console.print(f"\n[error]✘ Error:[/error] {message}")

    @staticmethod
    def show_success(path: Path):
        """Displays a success message."""
        console.print(f"\n[success]✔ Success![/success] Process completed.")
        console.print(f"📦 [white]File saved at:[/white] [link=file://{path}]{path}[/link]\n")

    @staticmethod
    def create_progress():
        """Creates a customized rich progress bar."""
        return Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=None),
            TaskProgressColumn(),
            TimeRemainingColumn(),
            console=console,
            transient=True
        )

    @staticmethod
    def ask_file_selection(files: List[Path]) -> Path:
        """Let the user select a file from a list."""
        console.print("\n[bold info]Please select a video file:[/bold info]")
        for i, f in enumerate(files, 1):
            console.print(f"  [highlight]{i}[/highlight]. {f.name}")
        
        choice = IntPrompt.ask("\nEnter number", choices=[str(i) for i in range(1, len(files) + 1)])
        return files[choice - 1]

    @staticmethod
    def ask_extraction_mode() -> str:
        """Let the user select the extraction mode."""
        console.print("\n[bold info]Choose extraction mode:[/bold info]")
        console.print("  [highlight]1[/highlight]. All Frames (Extract everything)")
        console.print("  [highlight]2[/highlight]. By FPS (e.g., 2 frames per second)")
        console.print("  [highlight]3[/highlight]. By Total Count (e.g., exactly 100 frames)")
        
        return Prompt.ask("\nEnter choice", choices=["1", "2", "3"], default="1")

    @staticmethod
    def ask_fps() -> float:
        """Ask for FPS value."""
        return FloatPrompt.ask("\n[info]Enter target FPS[/info] (frames per second)", default=1.0)

    @staticmethod
    def ask_total_frames() -> int:
        """Ask for total frame count."""
        return IntPrompt.ask("\n[info]Enter total number of frames[/info]", default=100)

    @staticmethod
    def ask_output_name(default_name: str) -> str:
        """Ask for output zip name."""
        return Prompt.ask("\n[info]Enter output filename[/info] (optional)", default=default_name)
