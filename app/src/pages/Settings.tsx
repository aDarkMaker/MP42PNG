import { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import folderIcon from '../assets/folder.svg';
import '../styles/VideoToPngPage.css';

export function Settings() {
	const [defaultPath, setDefaultPath] = useState<string>('');
	const [autoSave, setAutoSave] = useState<boolean>(false);

	useEffect(() => {
		const savedPath = localStorage.getItem('default_download_path') || '';
		const savedAutoSave = localStorage.getItem('auto_save_enabled') === 'true';
		setDefaultPath(savedPath);
		setAutoSave(savedAutoSave);
	}, []);

	const handleSelectDirectory = async () => {
		try {
			const { open } = await import('@tauri-apps/plugin-dialog');
			const selected = await open({
				directory: true,
				multiple: false,
				title: '选择默认下载目录'
			});
			if (selected && typeof selected === 'string') {
				setDefaultPath(selected);
				localStorage.setItem('default_download_path', selected);
			}
		} catch (error) {
			console.error('选择目录失败:', error);
		}
	};

	const handleToggleAutoSave = (enabled: boolean) => {
		setAutoSave(enabled);
		localStorage.setItem('auto_save_enabled', String(enabled));
	};

	const handleClearConfig = () => {
		if (confirm('确定要清除所有设置吗？')) {
			localStorage.removeItem('default_download_path');
			localStorage.removeItem('auto_save_enabled');
			setDefaultPath('');
			setAutoSave(false);
		}
	};

	return (
		<div className="page">
			<div className="header">
				<h2 className="title">设置</h2>
			</div>

			<div className="section">
				<div className="card">
					<h3 className="cardTitle">下载设置</h3>
					<div className="form">
						<div className="formGroup">
							<label className="formLabel" style={{ marginRight: '-8%' }}>位置</label>
							<div style={{ display: 'flex', gap: '8px' }}>
								<input
									type="text"
									value={defaultPath}
									readOnly
									placeholder="还没指定位置哦"
									className="formInput"
									style={{ flex: 1 }}
								/>
								<Button 
									variant="secondary" 
									onClick={handleSelectDirectory}
									style={{ padding: '0 12px', minWidth: 'auto' }}
								>
									<img src={folderIcon} alt="选择" style={{ width: '20px' }} />
								</Button>
							</div>
						</div>

						<div className="formGroup" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
							<input
								type="checkbox"
								id="autoSave"
								checked={autoSave}
								onChange={(e) => handleToggleAutoSave(e.target.checked)}
								style={{ width: '18px', height: '18px'}} />
							<label htmlFor="autoSave" className="formLabel" style={{ marginBottom: 0, cursor: 'pointer' }}>
								自动保存
							</label>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
