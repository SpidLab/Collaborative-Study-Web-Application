"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_js_1 = __importDefault(require("./logger.js"));
const requestLogger = (request, _response, next) => {
    logger_js_1.default.info('---');
    logger_js_1.default.info('Method:', request.method);
    logger_js_1.default.info('Path:  ', request.path);
    logger_js_1.default.info('Body:  ', request.body);
    logger_js_1.default.info('---');
    next();
};
const unknownEndpoint = (_request, response) => {
    response.status(404).send({ error: 'unknown endpoint' });
};
const errorHandler = (error, _request, response, next) => {
    logger_js_1.default.error(error.message);
    if (error.name === 'CastError') {
        return response.status(400).send({ error: 'malformatted id' });
    }
    else if (error.name === 'ValidationError') {
        return response.status(400).json({ error: error.message });
    }
    next(error);
    return;
};
const middleware = {
    requestLogger,
    unknownEndpoint,
    errorHandler
};
exports.default = middleware;
