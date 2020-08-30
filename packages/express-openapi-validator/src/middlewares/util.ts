import * as Ajv from 'ajv';
import * as url from 'url';
import * as qs from 'querystring';
import { Request } from 'express';
import { ValidationError } from '../framework/types';

export class ContentType {
  public contentType: string = null;
  public mediaType: string = null;
  public charSet: string = null;
  public withoutBoundary: string = null;
  private constructor(contentType: string | null) {
    this.contentType = contentType;
    if (contentType) {
      this.withoutBoundary = contentType.replace(/;\s{0,}boundary.*/, '');
      this.mediaType = this.withoutBoundary.split(';')[0].trim();
      this.charSet = this.withoutBoundary.split(';')[1];
      if (this.charSet) {
        this.charSet = this.charSet.trim();
      }
    }
  }
  public static from(req: Request): ContentType {
    return new ContentType(req.headers['content-type']);
  }

  public equivalents(): string[] {
    if (!this.withoutBoundary) return [];
    if (this.charSet) {
      return [this.mediaType, `${this.mediaType}; ${this.charSet}`];
    }
    return [this.withoutBoundary, `${this.mediaType}; charset=utf-8`];
  }
}

export function pathname(req: Request) {
  // req.path doesn't exist on a base node js request.
  // handle it to enable other frameworks e.g. fastify
  const pathname = req.path || url.parse(req.url).pathname;
  const baseUrl = req.baseUrl || '';
  return pathname.startsWith(baseUrl) ? pathname : `${req.baseUrl}/${req.path}`;
}

export function query(req) {
  console.log('call special query');
  const q = url.parse(req.url).query;
  const qo = { ...qs.parse(q) };
  return req.query || qo;
}

/**
 * (side-effecting) modifies the errors object
 * TODO - do this some other way
 * @param errors
 */
export function augmentAjvErrors(
  errors: Ajv.ErrorObject[] = [],
): Ajv.ErrorObject[] {
  errors.forEach((e) => {
    if (e.keyword === 'enum') {
      const params: any = e.params;
      const allowedEnumValues = params?.allowedValues;
      e.message = !!allowedEnumValues
        ? `${e.message}: ${allowedEnumValues.join(', ')}`
        : e.message;
    }
  });
  return errors;
}
export function ajvErrorsToValidatorError(
  status: number,
  errors: Ajv.ErrorObject[],
): ValidationError {
  return {
    status,
    errors: errors.map((e) => {
      const params: any = e.params;
      const required =
        params?.missingProperty && e.dataPath + '.' + params.missingProperty;
      const additionalProperty =
        params?.additionalProperty &&
        e.dataPath + '.' + params.additionalProperty;
      const path = required ?? additionalProperty ?? e.dataPath ?? e.schemaPath;
      return {
        path,
        message: e.message,
        errorCode: `${e.keyword}.openapi.validation`,
      };
    }),
  };
}

export const deprecationWarning =
  process.env.NODE_ENV !== 'production' ? console.warn : () => {};