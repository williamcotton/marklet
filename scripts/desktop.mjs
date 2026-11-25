import { spawn } from 'node:child_process'
import { developmentElectron } from './dev-bundle.mjs'

const child = spawn(developmentElectron(), ['.'], { stdio: 'inherit' })
child.once('exit', code => { process.exitCode = code ?? 0 })
