const test = require('brittle')
const b4a = require('b4a')
const createTestnet = require('@screamingvoid/dht/testnet')

const Swarm = require('..')

test('Server connections have topics', async (t) => {
  t.plan(4)

  const { bootstrap } = createTestnet(3, t.teardown)

  const topic1 = b4a.fill(b4a.allocUnsafe(32), '1')
  const topic2 = b4a.fill(b4a.allocUnsafe(32), '2')

  const server = new Swarm({ bootstrap })
  const client = new Swarm({ bootstrap })

  t.teardown(async () => {
    await server.destroy()
    await client.destroy()
  })

  let serverConnected = false
  server.on('connection', (socket, peer) => {
    socket.on('error', noop)
    if (!serverConnected) {
      t.alike(peer.topics.sort(b4a.compare), [topic1], msg(peer.client))
      peer.on('topic', (topic) => t.alike(topic, topic2, msg(peer.client)))
      serverConnected = true
    }
  })
  let clientConnected = false
  client.on('connection', (socket, peer) => {
    socket.on('error', noop)
    if (!clientConnected) {
      t.alike(peer.topics.sort(b4a.compare), [topic1], msg(peer.client))
      peer.on('topic', (topic) => t.alike(topic, topic2, msg(peer.client)))
      clientConnected = true
    }
  })

  await server.join(topic1, { server: true, client: false }).flushed()
  await client.join(topic1, { server: false, client: true }).flushed()

  // Half-assed, but in rl scenarios prob good enough
  const discovery = client.join(topic2, { server: true, client: true })
  await discovery.flushed()
  await server.join(topic2, { server: true, client: true }).flushed()
  await discovery.refresh()
})

function msg (client) {
  return client ? 'Client' : 'Server'
}

function noop () {}
