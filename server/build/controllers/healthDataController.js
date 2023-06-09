"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_js_1 = __importDefault(require("../utils/config.js"));
const metriportClient = config_js_1.default.METRIPORT_CLIENT;
const healthDataRouter = express_1.default.Router();
healthDataRouter.get('/:metriportId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.metriportId;
        if (!id) {
            res.status(404).send({ error: "Metriport ID not found. Please try logging out and logging in again." });
        }
        // UTC timezone
        // const date = new Date().toLocaleDateString("en-CA") // yyyy-mm-dd (e.g. 2023-02-23)
        const date = "2023-02-26"; // manual date    
        const activityData = yield metriportClient.getActivityData(id, date);
        const biometricsData = yield metriportClient.getBiometricsData(id, date);
        const bodyData = yield metriportClient.getBodyData(id, date);
        const nutritionData = yield metriportClient.getNutritionData(id, date);
        const sleepData = yield metriportClient.getSleepData(id, date);
        const data = {
            activityData: Object.assign({}, activityData),
            biometricsData: Object.assign({}, biometricsData),
            bodyData: Object.assign({}, bodyData),
            nutritionData: Object.assign({}, nutritionData),
            sleepData: Object.assign({}, sleepData)
        };
        return res.status(200).send(data);
    }
    catch (error) {
        return res.status(400).send({ error: "Unable to share health data." });
    }
}));
exports.default = healthDataRouter;
