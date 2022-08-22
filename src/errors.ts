type pgToolsError = {
    pgErr: {
        code: string
    }
}

/**
 *
 * @param error
 */
export function isPgToolsError(error: unknown): error is pgToolsError {
    return (
        error !== null &&
        typeof error === "object" &&
        typeof (error as pgToolsError).pgErr === "object" &&
        typeof (error as pgToolsError).pgErr.code === "string"
    )
}

type pgPromiseError = {
    code: string
}

/**
 *
 * @param error
 */
export function isPgPromiseError(error: unknown): error is pgPromiseError {
    return error !== null && typeof error === "object" && typeof (error as pgPromiseError).code === "string"
}

type ErrorWithMessage = {
    message: string
}

/**
 *
 * @param error
 */
function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
    return typeof error === "object" && error !== null && "message" in error && typeof (error as Record<string, unknown>).message === "string"
}

/**
 *
 * @param maybeError
 */
function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
    if (isErrorWithMessage(maybeError)) return maybeError

    try {
        return new Error(JSON.stringify(maybeError))
    } catch {
        // fallback in case there's an error stringifying the maybeError
        // like with circular references for example.
        return new Error(String(maybeError))
    }
}

/**
 *
 * @param error
 */
export function getErrorMessage(error: unknown) {
    return toErrorWithMessage(error).message
}
