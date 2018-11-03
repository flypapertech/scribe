process.env.SCRIBE_APP_DB_NAME = "test"
process.env.SCRIBE_APP_DB_PORT = "5433"
process.env.SCRIBE_APP_DB_USER = "postgres"
import { createServer } from "../src/scribe.cli"
import * as chai from "chai"
import { expect, assert } from "chai"
import chaiHttp = require("chai-http")
import * as _ from "lodash"

// TODO get types for mocha, remove anys
const mocha = require("mocha")
chai.use(chaiHttp)

let baseEndPoint = "http://localhost:1337"
let server: any;

const schema = require(__dirname + "/../src/default.table.schema.json")

mocha.before(function(done: any) {
    server = createServer(schema)
    done()
})
mocha.after(function(done: any) {
    server.close()
    done()
})

mocha.describe("scribe", function() {
    mocha.it("Checks that server is running", function(done: any) {
        chai.request(baseEndPoint)
            .get("/")
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.status, 200))
                done()
            })
    })

    mocha.it("DEL component table", function(done: any) {
        chai.request(baseEndPoint)
            .del("/testComponent")
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.status, 200))
                expect(res.body).to.eql([])
                done()
            })
    })

    mocha.it("POST to component", function(done: any) {
        let request = {
            "data": {
                "something": "somethingstring"
            },
            "date_created": "2017-06-22T17:57:32Z",
            "date_modified": "2018-06-22T17:57:32Z",
            "created_by": 2,
            "modified_by": 2
        }

        let expectedResponse = [
            {
                "id": 1,
                "data": {
                    "something": "somethingstring"
                },
                "date_created": "2017-06-22T21:57:32.000Z",
                "date_modified": "2018-06-22T21:57:32.000Z",
                "created_by": 2,
                "modified_by": 2
            }
        ]

        chai.request(baseEndPoint)
            .post("/testComponent")
            .send(request)
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.body, expectedResponse))
                done()
            })
    })

    mocha.it("GET all entries", function(done: any) {
        let expectedResponse = [
            {
                "id": 1,
                "data": {
                    "something": "somethingstring"
                },
                "date_created": "2017-06-22T21:57:32.000Z",
                "date_modified": "2018-06-22T21:57:32.000Z",
                "created_by": 2,
                "modified_by": 2
            }
        ]
        chai.request(baseEndPoint)
            .get("/testComponent/all")
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.body, expectedResponse))
                done()
            })
    })

    mocha.it("PUT entry", function(done: any) {
        let request = {
            "data": {
                "something": "we changed this",
                "data2": "new thing"
            },
            "date_created": "2017-06-22T17:57:32Z",
            "date_modified": "2018-06-22T17:57:32Z",
            "created_by": 2,
            "modified_by": 2
        }

        let expectedResponse = [
            {
                "id": 1,
                "data": {
                    "something": "we changed this",
                    "data2": "new thing"
                },
                "date_created": "2017-06-22T21:57:32.000Z",
                "date_modified": "2018-06-22T21:57:32.000Z",
                "created_by": 2,
                "modified_by": 2
            }
        ]

        chai.request(baseEndPoint)
            .put("/testComponent/1")
            .send(request)
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.body, expectedResponse))
                done()
        })
    })

    mocha.it("GET all history", function(done: any) {
        let expectedResponse = [
            {
                "id": 1,
                "history": [
                    {
                        "id": 1,
                        "data": {
                            "something": "we changed this",
                            "data2": "new thing"
                        },
                        "date_created": "2017-06-22T21:57:32.000Z",
                        "date_modified": "2018-06-22T21:57:32.000Z",
                        "created_by": 2,
                        "modified_by": 2
                    },
                    {
                        "id": 1,
                        "data": {
                            "something": "somethingstring"
                        },
                        "date_created": "2017-06-22T21:57:32.000Z",
                        "date_modified": "2018-06-22T21:57:32.000Z",
                        "created_by": 2,
                        "modified_by": 2
                    }
                ]
            }
        ]

        chai.request(baseEndPoint)
            .get("/testComponent/all/history")
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.body, expectedResponse))
                done()
        })
    })

    mocha.it("PUT with schema change", function(done: any) {
        server.close()
        let newSchema = schema
        newSchema.required.push("new_column")
        newSchema.properties["new_column"] = {
            "type": "string"
        }

        server = createServer(newSchema)
        let request = {
            "data": {
                "something": "somethingstring"
            },
            "date_created": "2017-06-22T17:57:32Z",
            "date_modified": "2018-06-22T17:57:32Z",
            "created_by": 2,
            "modified_by": 2,
            "new_column": "woot"
        }
        let expectedResponse = [
            {
                "id": 1,
                "data": {
                    "something": "somethingstring"
                },
                "date_created": "2017-06-22T21:57:32.000Z",
                "date_modified": "2018-06-22T21:57:32.000Z",
                "created_by": 2,
                "modified_by": 2,
                "new_column": "\"woot\""
            }
        ]

        chai.request(baseEndPoint)
            .put("/testComponent/1")
            .send(request)
            .end((err, res) => {
                assert.isTrue(_.isEqual(res.body, expectedResponse))
                done()
        })
    })
})