import { randomUUID } from 'node:crypto'
import { validate } from './funnel-doc-validator'
import { buildRaioXDocument } from './build-raiox-funnel'

validate(buildRaioXDocument(randomUUID()), 'RAIO-X DA CLÍNICA')
console.log('\nRAIO-X funnel passed structural validation.')
