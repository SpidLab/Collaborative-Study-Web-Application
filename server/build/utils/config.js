"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeHatClient = void 0;
const dotenv = __importStar(require("dotenv"));
const api_1 = require("@metriport/api");
const hat_js_1 = require("@dataswift/hat-js");
dotenv.config();
const initializeHatClient = (pdaToken, pdaUsername) => {
    const config = {
        token: pdaToken,
        apiVersion: "v2.6",
        secure: false,
        hatDomain: `${pdaUsername}.hubat.net`
    };
    const hat = new hat_js_1.HatClient(config);
    return hat;
};
exports.initializeHatClient = initializeHatClient;
const appConfig = {
    applicationId: 'ar-s-progressiveemployeestressapp',
    namespace: 'progressiveemployeestore',
    hatCluster: '.hubat.net',
    hatApiVersion: 'v2.6',
    secure: false,
};
const PORT = process.env.PORT;
const MONGODB_URI = process.env.MONGODB_URI;
const METRIPORT_CLIENT = new api_1.Metriport(process.env.METRIPORT_API_KEY);
const PDA_URL_EXT = process.env.PDA_URL_EXT;
const config = { PORT, MONGODB_URI, METRIPORT_CLIENT, PDA_URL_EXT, appConfig };
exports.default = config;
