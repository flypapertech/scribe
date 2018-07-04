process.env.SCRIBE_APP_DB_NAME = "test"
import {createServer} from "../src/scribe.cli"
import * as mocha from "mocha"
import * as chai from "chai"
import * as chaiHttp from "chai-http"
let should = chai.should()
let baseEndPoint = "http://localhost:1337"
let server;

const schema = require(__dirname + "/../src/default.table.schema.json")
chai.use(chaiHttp)

mocha.before(function(done) {
    server = createServer(schema)
    done()
})
mocha.after(function(done) {
    server.close()
    done()
})

mocha.describe("scribe", function() {
    mocha.it("Checks that server is running", function(done) {
        chai.request(baseEndPoint)
            .get("/v0")
            .end((err,res) => {
                res.should.have.status(200)
                done()
            })
    })

    mocha.it("DEL component table", function(done) {
        chai.request(baseEndPoint)
            .delete("/v0/testComponent")
            .end((err,res) => {
                res.should.have.status(200)
                res.body.should.be.eql([])
                done()
            })
    })

    mocha.it("POST to component", function(done) {
        var request = {
            "data": {
                "something": "somethingstring"
            },
            "date_created": "2017-06-22T17:57:32Z",
            "date_modified": "2018-06-22T17:57:32Z",
            "created_by": 2,
            "modified_by": 2
        }

        var expectedResponse = [
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
            .post("/v0/testComponent")
            .send(request)
            .end((err, res) => {
                res.body.should.be.eql(expectedResponse)
                done()
            })
    })

    mocha.it("GET all entries", function(done) {
        var expectedResponse = [
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
            .get("/v0/testComponent/all")
            .end((err,res) => {
                res.should.have.status(200)
                res.body.should.be.eql(expectedResponse)
                done()
            })
    })

    mocha.it("PUT entry", function(done){
        var request = {
            "data": {
                "something": "we changed this",
                "data2": "new thing"
            },
            "date_created": "2017-06-22T17:57:32Z",
            "date_modified": "2018-06-22T17:57:32Z",
            "created_by": 2,
            "modified_by": 2
        }

        var expectedResponse = [
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
            .put("/v0/testComponent/1")
            .send(request)
            .end((err, res) => {
                res.body.should.be.eql(expectedResponse)
                done()
        })
    })

    mocha.it("GET all history", function(done){
        var expectedResponse = [
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
            .get("/v0/testComponent/all/history")
            .end((err, res) => {
                res.body.should.be.eql(expectedResponse)
                done()
        })
    })

    mocha.it("PUT with schema change", function(done){
        server.close()
        let newSchema = schema
        newSchema.required.push("new_column")
        newSchema.properties["new_column"]= {
            "type": "string"
        }

        server = createServer(newSchema)
        var request = {
            "data": {
                "something": "somethingstring"
            },
            "date_created": "2017-06-22T17:57:32Z",
            "date_modified": "2018-06-22T17:57:32Z",
            "created_by": 2,
            "modified_by": 2,
            "new_column": "woot"
        }
        var expectedResponse = [
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
            .put("/v0/testComponent/1")
            .send(request)
            .end((err, res) => {
                res.body.should.be.eql(expectedResponse)
                done()
        })
    })
})