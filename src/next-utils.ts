import next from "next"

// utilities for next
const PORT = Number(process.env.PORT) || 3000

export const nextApp = next({
    dev: process.env.NODE_ENV !== "production",
    port: PORT
})

// handler for next js logic for self hosting
export const nextHandler = nextApp.getRequestHandler()