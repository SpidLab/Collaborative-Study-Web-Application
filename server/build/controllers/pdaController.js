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
// import axios from 'axios'
const config_js_1 = __importDefault(require("../utils/config.js"));
const config_js_2 = require("../utils/config.js");
// const PDA_URL_EXT = config.PDA_URL_EXT
const appConfig = config_js_1.default.appConfig;
const pdaRouter = express_1.default.Router();
pdaRouter.get('/getData/:pdaUsername/:pdaToken', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const token = req.params.pdaToken;
    const pdaUsername = req.params.pdaUsername;
    const hat = (0, config_js_2.initializeHatClient)(token, pdaUsername);
    console.log("PDA ACCESS TOKEN =======================");
    console.log(token);
    console.log("PDA USERNAME =======================");
    console.log(pdaUsername);
    try {
        const pdaData = yield hat.hatData().getAllDefault(appConfig.namespace, "test");
        return res.status(200).send({ data: pdaData });
    }
    catch (error) {
        return res.status(400).send({ error: "Unable to get Dataswift PDA data." });
    }
}));
pdaRouter.post('/postData/:pdaUsername', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = req.body;
    const pdaUsername = req.params.pdaUsername;
    const hat = (0, config_js_2.initializeHatClient)(body.pdaToken, pdaUsername);
    try {
        const pdaData = yield hat.hatData().create(appConfig.namespace, "test", body.healthData);
        return res.status(200).send({ data: pdaData });
    }
    catch (error) {
        return res.status(400).send({ error: "Unable to push data to PDA." });
    }
}));
// const getPDAData = async (pdaToken, pdaUsername) => {
//     const config = {
//         headers: {
//             "Content-Type": "application/json",
//             "x-auth-token": pdaToken
//         }
//     }
//     const response = await axios.get(`http://${pdaUsername}.${PDA_URL_EXT}`, config)
//     // console.log(response.data)
//     return response.data
// }
// const pushDataToPDA = async (data, pdaUsername, pdaToken) => {
//     const config = {
//         headers: {
//             "Content-Type": "application/json",
//             "x-auth-token": pdaToken
//         }
//     }
//     const response = await axios.post(`http://${pdaUsername}.${PDA_URL_EXT}`, data, config)
//     // console.log(response.data)
//     return response.data
// }
exports.default = pdaRouter;
