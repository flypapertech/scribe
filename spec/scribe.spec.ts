import "jasmine"
import {createServer} from "../src/scribe.cli"
import * as http from "http"
import "axios"
import Axios from "axios";

describe("scribe", () => {
    let server: http.Server
    let endpoint: string
    beforeAll(() => {
        endpoint = "http://localhost:1337/"
        server = createServer()
    })
    afterAll(() => {
        server.close()
    })

    it("Checks that scribe is running", () => {
        Axios.get(endpoint)
            .then(res => {
                expect(res.status).toEqual(200)
            })
            .catch(err => {
                fail()
            })
    })
})