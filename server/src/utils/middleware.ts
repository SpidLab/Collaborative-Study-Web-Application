import { NextFunction, Request, Response } from "express"
import logger from "./logger"

const requestLogger = (request: Request, _response: Response, next: NextFunction) => {
    logger.info('---')
    logger.info('Method:', request.method)
    logger.info('Path:  ', request.path)
    logger.info('Body:  ', request.body)
    logger.info('---')
    next()
}

const unknownEndpoint = (_request: Request, response: Response) => {
    response.status(404).send({ error: 'unknown endpoint' })
}

const errorHandler = (error: Error, _request: Request, response: Response, next: NextFunction) => {
    logger.error(error.message)

    if (error.name === 'CastError') {
        return response.status(400).send({ error: 'malformatted id' })
    } else if (error.name === 'ValidationError') {
        return response.status(400).json({ error: error.message })
    }

    next(error)
    return
}

const middleware = {
    requestLogger,
    unknownEndpoint,
    errorHandler
}

export default middleware