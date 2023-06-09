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
const bcrypt_1 = __importDefault(require("bcrypt"));
const express_1 = __importDefault(require("express"));
const employee_js_1 = __importDefault(require("../models/employee.js"));
const config_js_1 = __importDefault(require("../utils/config.js"));
const metriportClient = config_js_1.default.METRIPORT_CLIENT;
const employeeRouter = express_1.default.Router();
employeeRouter.post('/auth', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { progressiveEmployeeId, password } = req.body;
    const employee = yield employee_js_1.default.findOne({ progressiveEmployeeId });
    if (!employee) {
        return res.status(404).json({
            error: `Employee ${progressiveEmployeeId} does not exist.`
        });
    }
    if (!employee.passwordHash) {
        return res.status(401).json({
            error: 'Something went wrong.'
        });
    }
    const passwordCorrect = employee === null
        ? false
        : yield bcrypt_1.default.compare(password, employee.passwordHash); // await is necessary
    if (!passwordCorrect) {
        return res.status(401).json({
            error: 'Incorrect password.'
        });
    }
    const metriportId = employee.metriportId;
    if (!metriportId) {
        return res.status(404).json({ error: "Metriport Id not created." });
    }
    const token = yield metriportClient.getConnectToken(metriportId);
    return res.status(200).send({ metriportId: metriportId, metriportToken: token });
}));
employeeRouter.post('/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { progressiveEmployeeId, name, password } = req.body;
    if (progressiveEmployeeId.length < 1 || password.length < 1) {
        return res.status(400).json({
            error: 'Employee ID and password must be at least 1 character long.'
        });
    }
    const existingEmployee = yield employee_js_1.default.findOne({ progressiveEmployeeId });
    if (existingEmployee) {
        return res.status(400).json({
            error: `Account already created for employee ${progressiveEmployeeId}.`
        });
    }
    const passwordHash = yield bcrypt_1.default.hash(password, 10);
    const metriportId = yield metriportClient.getMetriportUserId(progressiveEmployeeId);
    const employee = new employee_js_1.default({
        progressiveEmployeeId,
        name,
        passwordHash,
        metriportId
    });
    const savedEmployee = yield employee.save();
    return res.status(201).json(savedEmployee);
}));
exports.default = employeeRouter;
