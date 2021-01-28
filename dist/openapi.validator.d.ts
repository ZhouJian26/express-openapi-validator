import ajv = require('ajv');
import { Application, Router } from 'express';
import { OpenApiContext } from './framework/openapi.context';
import { Spec } from './framework/openapi.spec.loader';
import { OpenApiValidatorOpts, OpenApiRequestHandler, RequestValidatorOptions, Options } from './framework/types';
export { OpenApiValidatorOpts, InternalServerError, UnsupportedMediaType, RequestEntityTooLarge, BadRequest, MethodNotAllowed, NotAcceptable, NotFound, Unauthorized, Forbidden, } from './framework/types';
export declare class OpenApiValidator {
    readonly options: OpenApiValidatorOpts;
    readonly ajvOpts: AjvOptions;
    constructor(options: OpenApiValidatorOpts);
    installMiddleware(spec: Promise<Spec>): OpenApiRequestHandler[];
    installPathParams(app: Application | Router, context: OpenApiContext): void;
    private metadataMiddlware;
    private multipartMiddleware;
    private securityMiddleware;
    private requestValidationMiddleware;
    private responseValidationMiddleware;
    installOperationHandlers(baseUrl: string, context: OpenApiContext): Router;
    private validateOptions;
    private normalizeOptions;
    private isOperationHandlerOptions;
}
declare class AjvOptions {
    private options;
    constructor(options: OpenApiValidatorOpts);
    get preprocessor(): ajv.Options;
    get response(): ajv.Options;
    get request(): RequestValidatorOptions;
    get multipart(): Options;
    private baseOptions;
}
