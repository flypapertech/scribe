process.env.SCRIBE_APP_DB_NAME = "test"
import {createServer} from "../src/scribe.cli"
import * as mocha from "mocha"
import * as chai from "chai"
import * as chaiHttp from "chai-http"
let should = chai.should()
let baseEndPoint = "http://localhost:1337"
let server;

chai.use(chaiHttp)

mocha.before(function(done) {
    server = createServer()
    done()
})
mocha.after(function(done) {
    server.close()
    done()
})

mocha.describe("scribe", function() {
    mocha.it("Gets all entries", function(done) {
        chai.request(baseEndPoint)
            .get("/v0/testComponent/all")
            .end((err,res) => {
                res.should.have.status(200)
                done()
            })
    })

    mocha.it("Deletes test table", function(done) {
        chai.request(baseEndPoint)
            .delete("/v0/testComponent")
            .end((err,res) => {
                res.should.have.status(200)
                done()
            })
    })

    mocha.it("Creates entry in component", function(done) {
        var request = {
            "data": {
                "something": "somethingstring"
            },
            "dateCreated": "2017-06-22T17:57:32Z",
            "dateModified": "2018-06-22T17:57:32Z",
            "createdBy": 2,
            "modifiedBy": 2
        }

        var expectedResponse = [
            {
                "id": 1,
                "data": {
                    "something": "somethingstring"
                },
                "datecreated": "2017-06-22T21:57:32.000Z",
                "datemodified": "2018-06-22T21:57:32.000Z",
                "createdby": 2,
                "modifiedby": 2
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
})