"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = __importDefault(require("./utils/logger"));
const middleware_1 = __importDefault(require("./utils/middleware"));
const config_1 = __importDefault(require("./utils/config"));
const mongoose_1 = __importDefault(require("mongoose"));
const employeeController_1 = __importDefault(require("./controllers/employeeController"));
const healthDataController_1 = __importDefault(require("./controllers/healthDataController"));
const pdaController_1 = __importDefault(require("./controllers/pdaController"));
logger_1.default.info('Connecting to MongoDB');
mongoose_1.default.set('strictQuery', false);
mongoose_1.default.connect(config_1.default.MONGODB_URI)
    .then(() => {
    logger_1.default.info('Connected to MongoDB');
})
    .catch((error) => {
    logger_1.default.error('Error connecting to MongoDB:', error.message);
});
const app = (0, express_1.default)();
const port = config_1.default.PORT || 5005;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(middleware_1.default.requestLogger);
// Authentication routes
// ==============================================
app.use('/api/login', employeeController_1.default);
// Push health data routes
// ==============================================
app.use('/api/data/share', healthDataController_1.default);
// PDA routes
// ==============================================
app.use('/api/pda', pdaController_1.default);
app.use(middleware_1.default.unknownEndpoint);
app.use(middleware_1.default.errorHandler);
app.listen(port, () => {
    logger_1.default.info(`Server listening on port ${port}`);
});
