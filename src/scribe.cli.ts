#!/usr/bin/env node
import cluster from "cluster"
import os from "os"

import { createServer, tryCreateDb } from "./scribe.js"

if (cluster.isMaster) {
    tryCreateDb()
        .then(() => {
            const cores = os.cpus()

            for (let i = 0; i < cores.length; i++) cluster.fork()

            cluster.on("exit", (worker) => {
                cluster.fork()
            })
        })
        .catch((error) => {
            throw error
        })
} else {
    createServer()
}
