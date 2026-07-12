// API base URL. Set VITE_API_URL at build time for deployment (e.g. the central
// collaboration server's constant domain). Falls back to localhost for dev.
const URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
export default URL;
