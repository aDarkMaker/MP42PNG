import { useState } from 'react';
import { Layout } from './components/Layout';
import { VideoToPngPage } from './pages/VideoToPngPage';
import { Settings } from './pages/Settings';
import './styles/global.css';

export function App() {
	const [activeTab, setActiveTab] = useState('video-to-png');

	return (
		<div className="app-container">
			<Layout activeTab={activeTab} onTabChange={setActiveTab}>
				{activeTab === 'video-to-png' ? <VideoToPngPage /> : <Settings />}
			</Layout>
		</div>
	);
}

export default App;
