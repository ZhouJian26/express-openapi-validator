"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestValidator = void 0;
const ajv_1 = require("../framework/ajv");
const util_1 = require("./util");
const types_1 = require("../framework/types");
const body_parse_1 = require("./parsers/body.parse");
const schema_parse_1 = require("./parsers/schema.parse");
const req_parameter_mutator_1 = require("./parsers/req.parameter.mutator");
class RequestValidator {
    constructor(apiDoc, options = {}) {
        this.middlewareCache = {};
        this.requestOpts = {};
        this.middlewareCache = {};
        this.apiDoc = apiDoc;
        this.requestOpts.allowUnknownQueryParameters =
            options.allowUnknownQueryParameters;
        this.ajv = ajv_1.createRequestAjv(apiDoc, Object.assign(Object.assign({}, options), { coerceTypes: true }));
        this.ajvBody = ajv_1.createRequestAjv(apiDoc, options);
    }
    validate(req, res, next) {
        var _a;
        if (!req.openapi) {
            // this path was not found in open api and
            // this path is not defined under an openapi base path
            // skip it
            return next();
        }
        const openapi = req.openapi;
        const path = openapi.expressRoute;
        const reqSchema = openapi.schema;
        // cache middleware by combining method, path, and contentType
        const contentType = util_1.ContentType.from(req);
        const contentTypeKey = (_a = contentType.equivalents()[0]) !== null && _a !== void 0 ? _a : 'not_provided';
        // use openapi.expressRoute as path portion of key
        const key = `${req.method}-${path}-${contentTypeKey}`;
        if (!this.middlewareCache[key]) {
            const middleware = this.buildMiddleware(path, reqSchema, contentType);
            this.middlewareCache[key] = middleware;
        }
        return this.middlewareCache[key](req, res, next);
    }
    buildMiddleware(path, reqSchema, contentType) {
        var _a;
        const apiDoc = this.apiDoc;
        const schemaParser = new schema_parse_1.ParametersSchemaParser(this.ajv, apiDoc);
        const parameters = schemaParser.parse(path, reqSchema.parameters);
        const securityQueryParam = Security.queryParam(apiDoc, reqSchema);
        const body = new body_parse_1.BodySchemaParser().parse(path, reqSchema, contentType);
        const validator = new Validator(this.apiDoc, parameters, body, {
            general: this.ajv,
            body: this.ajvBody,
        });
        const allowUnknownQueryParameters = !!((_a = reqSchema['x-allow-unknown-query-parameters']) !== null && _a !== void 0 ? _a : this.requestOpts.allowUnknownQueryParameters);
        return (req, res, next) => {
            var _a, _b, _c, _d, _e, _f;
            const openapi = req.openapi;
            const pathParams = Object.keys(openapi.pathParams);
            const hasPathParams = pathParams.length > 0;
            if (hasPathParams) {
                // handle wildcard path param syntax
                if (openapi.expressRoute.endsWith('*')) {
                    // if we have an express route /data/:p*, we require a path param, p
                    // if the p param is empty, the user called /p which is not found
                    // if it was found, it would match a different route
                    if (pathParams.filter((p) => openapi.pathParams[p]).length === 0) {
                        throw new types_1.NotFound({
                            path: req.path,
                            message: 'not found',
                        });
                    }
                }
                req.params = (_a = openapi.pathParams) !== null && _a !== void 0 ? _a : req.params;
            }
            const schemaPoperties = validator.allSchemaProperties;
            const mutator = new req_parameter_mutator_1.RequestParameterMutator(this.ajv, apiDoc, path, schemaPoperties);
            mutator.modifyRequest(req);
            if (!allowUnknownQueryParameters) {
                this.processQueryParam(req.query, schemaPoperties.query, securityQueryParam);
            }
            const cookies = req.cookies
                ? Object.assign(Object.assign({}, req.cookies), req.signedCookies) : undefined;
            const data = {
                query: (_b = req.query) !== null && _b !== void 0 ? _b : {},
                headers: req.headers,
                params: req.params,
                cookies,
                body: req.body,
            };
            const schemaBody = validator === null || validator === void 0 ? void 0 : validator.schemaBody;
            const discriminator = (_d = (_c = schemaBody === null || schemaBody === void 0 ? void 0 : schemaBody.properties) === null || _c === void 0 ? void 0 : _c.body) === null || _d === void 0 ? void 0 : _d._discriminator;
            const discriminatorValdiator = this.discriminatorValidator(req, discriminator);
            const validatorBody = discriminatorValdiator !== null && discriminatorValdiator !== void 0 ? discriminatorValdiator : validator.validatorBody;
            const valid = validator.validatorGeneral(data);
            const validBody = validatorBody(discriminatorValdiator ? data.body : data);
            if (valid && validBody) {
                next();
            }
            else {
                const errors = util_1.augmentAjvErrors([]
                    .concat((_e = validator.validatorGeneral.errors) !== null && _e !== void 0 ? _e : [])
                    .concat((_f = validatorBody.errors) !== null && _f !== void 0 ? _f : []));
                const err = util_1.ajvErrorsToValidatorError(400, errors);
                const message = this.ajv.errorsText(errors, { dataVar: 'request' });
                const error = new types_1.BadRequest({
                    path: req.path,
                    message: message,
                });
                error.errors = err.errors;
                throw error;
            }
        };
    }
    discriminatorValidator(req, discriminator) {
        if (discriminator) {
            const { options, property, validators } = discriminator;
            const discriminatorValue = req.body[property]; // TODO may not alwasy be in this position
            if (options.find((o) => o.option === discriminatorValue)) {
                return validators[discriminatorValue];
            }
            else {
                throw new types_1.BadRequest({
                    path: req.path,
                    message: `'${property}' should be equal to one of the allowed values: ${options
                        .map((o) => o.option)
                        .join(', ')}.`,
                });
            }
        }
        return null;
    }
    processQueryParam(query, schema, whiteList = []) {
        var _a;
        const entries = Object.entries((_a = schema.properties) !== null && _a !== void 0 ? _a : {});
        let keys = [];
        for (const [key, prop] of entries) {
            if (prop['type'] === 'object' && prop['additionalProperties']) {
                // we have an object that allows additional properties
                return;
            }
            keys.push(key);
        }
        const knownQueryParams = new Set(keys);
        whiteList.forEach((item) => knownQueryParams.add(item));
        const queryParams = Object.keys(query);
        const allowedEmpty = schema.allowEmptyValue;
        for (const q of queryParams) {
            if (!knownQueryParams.has(q)) {
                throw new types_1.BadRequest({
                    path: `.query.${q}`,
                    message: `Unknown query parameter '${q}'`,
                });
            }
            else if (!(allowedEmpty === null || allowedEmpty === void 0 ? void 0 : allowedEmpty.has(q)) && (query[q] === '' || null)) {
                throw new types_1.BadRequest({
                    path: `.query.${q}`,
                    message: `Empty value found for query parameter '${q}'`,
                });
            }
        }
    }
}
exports.RequestValidator = RequestValidator;
class Validator {
    constructor(apiDoc, parametersSchema, bodySchema, ajv) {
        this.apiDoc = apiDoc;
        this.schemaGeneral = this._schemaGeneral(parametersSchema);
        this.schemaBody = this._schemaBody(bodySchema);
        this.allSchemaProperties = Object.assign(Object.assign({}, this.schemaGeneral.properties), { body: this.schemaBody.properties.body });
        this.validatorGeneral = ajv.general.compile(this.schemaGeneral);
        this.validatorBody = ajv.body.compile(this.schemaBody);
    }
    _schemaGeneral(parameters) {
        // $schema: "http://json-schema.org/draft-04/schema#",
        return {
            paths: this.apiDoc.paths,
            components: this.apiDoc.components,
            required: ['query', 'headers', 'params'],
            properties: Object.assign(Object.assign({}, parameters), { body: {} }),
        };
    }
    _schemaBody(body) {
        // $schema: "http://json-schema.org/draft-04/schema#"
        const isBodyBinary = (body === null || body === void 0 ? void 0 : body['format']) === 'binary';
        const bodyProps = isBodyBinary ? {} : body;
        const bodySchema = {
            paths: this.apiDoc.paths,
            components: this.apiDoc.components,
            properties: {
                query: {},
                headers: {},
                params: {},
                cookies: {},
                body: bodyProps,
            },
        };
        const requireBody = body.required && !isBodyBinary;
        if (requireBody) {
            bodySchema.required = ['body'];
        }
        return bodySchema;
    }
}
class Security {
    static queryParam(apiDocs, schema) {
        var _a;
        const hasPathSecurity = schema.hasOwnProperty('security') && schema.security.length > 0;
        const hasRootSecurity = apiDocs.hasOwnProperty('security') && apiDocs.security.length > 0;
        let usedSecuritySchema = [];
        if (hasPathSecurity) {
            usedSecuritySchema = schema.security;
        }
        else if (hasRootSecurity) {
            // if no security schema for the path, use top-level security schema
            usedSecuritySchema = apiDocs.security;
        }
        const securityQueryParameter = this.getSecurityQueryParams(usedSecuritySchema, (_a = apiDocs.components) === null || _a === void 0 ? void 0 : _a.securitySchemes);
        return securityQueryParameter;
    }
    static getSecurityQueryParams(usedSecuritySchema, securitySchema) {
        return usedSecuritySchema && securitySchema
            ? usedSecuritySchema
                .filter((obj) => Object.entries(obj).length !== 0)
                .map((sec) => {
                const securityKey = Object.keys(sec)[0];
                return securitySchema[securityKey];
            })
                .filter((sec) => (sec === null || sec === void 0 ? void 0 : sec.type) === 'apiKey' && (sec === null || sec === void 0 ? void 0 : sec.in) == 'query')
                .map((sec) => sec.name)
            : [];
    }
}
//# sourceMappingURL=openapi.request.validator.js.map