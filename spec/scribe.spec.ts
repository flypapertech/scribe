import "jasmine"
import * as request from "request"

const endpoint = "http://localhost:1337/"

describe("scribe", () => {
    it("Checks that scribe is running", () => {
        request.get(endpoint, function (err, res) {
            expect(res.statusCode).toEqual(200)
        })
    })
})