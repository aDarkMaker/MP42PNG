import { Layout } from './components/Layout';
import { VideoToPngPage } from './pages/VideoToPngPage';
import './styles/global.css';

export function App() {
	return (
		<div className="app-container">
			<Layout>
				<VideoToPngPage />
			</Layout>
		</div>
	);
}

export default App;
