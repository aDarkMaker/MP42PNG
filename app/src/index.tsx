import { serve } from 'bun';
import index from './index.html';

const server = serve({
	routes: {
		// 为所有未匹配的路由提供 index.html（SPA 支持）
		'/*': index,

		// API 路由预留区域
		// TODO: 在这里添加与 Python 后端通信的 API
	},

	development: process.env.NODE_ENV !== 'production' && {
		// 开发环境启用热更新
		hmr: true,
		// 在服务器上显示浏览器控制台日志
		console: true,
	},
});

console.log(`🚀 MP42PNG Server running at ${server.url}`);
