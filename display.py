from rich.console import Console  # pyright: ignore[reportMissingImports]
from rich.panel import Panel  # pyright: ignore[reportMissingImports]
from rich.table import Table  # pyright: ignore[reportMissingImports]
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeRemainingColumn  # pyright: ignore[reportMissingImports]
from rich.theme import Theme  # pyright: ignore[reportMissingImports]
from rich.prompt import Prompt, FloatPrompt  # pyright: ignore[reportMissingImports]
from pathlib import Path
from typing import List, Optional
import questionary # pyright: ignore[reportMissingImports]

# 自定义主题
custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "highlight": "#ff8c00",
})

console = Console(theme=custom_theme)

class Display:
    @staticmethod
    def show_header():
        """显示应用标题"""
        header_text = "[bold #ff8c00]MP4[/bold #ff8c00] [white]to[/white] [bold cyan]PNG[/bold cyan] [italic white]Tools[/italic white]"
        console.print(Panel(header_text, subtitle="[gray]By Orange[/gray]", expand=False))

    @staticmethod
    def show_video_info(input_path: Path, output_path: Path, fps: float):
        """在表格中显示视频信息和配置"""
        table = Table(show_header=False, box=None)
        table.add_row("[info]目标文件:[/info]", f"[white]{input_path.name}[/white]")
        table.add_row("[info]导出文件:[/info]", f"[white]{output_path.name}[/white]")
        table.add_row("[info]每秒帧率:[/info]", f"[highlight]{fps} 帧/秒[/highlight]")
        
        console.print(Panel(table, title="[bold white]Tasks[/bold white]", border_style="blue", expand=False))

    @staticmethod
    def show_error(message: str):
        """显示错误信息"""
        console.print(f"\n[error]✘ 错误:[/error] {message}")

    @staticmethod
    def show_success(path: Path):
        """显示成功信息"""
        console.print(f"\n[success]✔ 完成![/success]")
        console.print(f"📦 [white]文件保存至:[/white] [link=file://{path}]{path}[/link]\n")

    @staticmethod
    def create_progress():
        """创建自定义进度条"""
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
        file_names = [f.name for f in files]
        selected_name = questionary.select(
            "请选择要处理的视频文件 (回车确认):",
            choices=file_names,
            style=questionary.Style([
                ('qmark', 'fg:cyan bold'),
                ('question', 'bold'),
                ('answer', 'fg:#ff8c00 bold'),
                ('pointer', 'fg:#ff8c00 bold'),
                ('highlighted', 'fg:#ff8c00 bold'),
                ('selected', 'fg:green'),
            ])
        ).ask()
        
        if not selected_name:
            sys.exit(0)
            
        return next(f for f in files if f.name == selected_name)

    @staticmethod
    def ask_fps() -> float:
        """询问 FPS 值"""
        return FloatPrompt.ask("\n[info]一秒导出几帧?[/info]")

    @staticmethod
    def ask_output_name(default_name: str) -> str:
        """询问导出 ZIP 的名称"""
        return Prompt.ask("\n[info]导出命名[/info]", default=default_name)

import sys # 导入 sys 用于退出
