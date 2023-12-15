const test = require('brittle')
const b4a = require('b4a')
const createTestnet = require('@screamingvoid/dht/testnet')
const { timeout } = require('./helpers')

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

test('Client connections get saturated', async (t) => {
  t.plan(4)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const maxPeers = 8
  const dropConnections = false
  const topic1 = b4a.fill(b4a.allocUnsafe(32), '3')
  const topic2 = b4a.fill(b4a.allocUnsafe(32), '4')
  let connections = 0
  const onconnect = (socket, peer) => {
    socket.on('error', noop)
    connections++
  }

  const swarm = new Swarm({ bootstrap, maxPeers, dropConnections })
  swarm.on('connection', onconnect)

  const swarms = []
  for (let i = 0; i < maxPeers; i++) {
    const swarm = new Swarm({ bootstrap, maxPeers, dropConnections })
    swarm.on('connection', onconnect)
    swarms.push(swarm)
  }

  await swarm.join(topic1).flushed()
  await Promise.all(swarms.map((s) => s.join(topic1).flushed()))
  await timeout(500)

  t.is(connections, maxPeers * 2)

  const other = new Swarm({ bootstrap, maxPeers, dropConnections })
  other.on('connection', onconnect)
  await other.join(topic2).flushed()
  await swarm.join(topic2).flushed()
  await timeout(500)

  t.is(connections, maxPeers * 2)

  await timeout(500)
  t.absent(swarm._allConnections.has(other.keyPair.publicKey))
  t.absent(other._allConnections.has(swarm.keyPair.publicKey))

  t.teardown(async () => {
    await swarm.destroy()
    await Promise.all(swarms.map((s) => s.destroy()))
    await other.destroy()
  })
})

test('Redudant connections get dropped', async (t) => {
  t.plan(5)

  const { bootstrap } = await createTestnet(3, t.teardown)

  const maxPeers = 8
  const dropConnections = true
  const topic1 = b4a.fill(b4a.allocUnsafe(32), '5')
  const topic2 = b4a.fill(b4a.allocUnsafe(32), '6')
  let connections = 0
  const onconnect = (socket, peer) => {
    socket.on('error', noop)
    connections++
  }

  const swarm = new Swarm({ bootstrap, maxPeers, dropConnections })
  swarm.on('connection', onconnect)

  const swarms = []
  for (let i = 0; i < maxPeers; i++) {
    const swarm = new Swarm({ bootstrap, maxPeers, dropConnections })
    swarm.on('connection', onconnect)
    swarms.push(swarm)
  }

  await swarm.join(topic1).flushed()
  await Promise.all(swarms.map((s) => s.join(topic1).flushed()))
  await timeout(500)

  t.is(connections, maxPeers * 2)

  const other = new Swarm({ bootstrap, maxPeers, dropConnections })
  other.on('connection', onconnect)
  await other.join(topic2).flushed()
  await swarm.join(topic2).flushed()
  await timeout(500)

  t.is(connections, maxPeers * 2 + 2)

  await timeout(500)
  t.ok(swarm._allConnections.has(other.keyPair.publicKey))
  t.ok(other._allConnections.has(swarm.keyPair.publicKey))
  t.is(swarm._allConnections.size, maxPeers - 1)

  t.teardown(async () => {
    await swarm.destroy()
    await Promise.all(swarms.map((s) => s.destroy()))
    await other.destroy()
  })
})

function msg (client) {
  return client ? 'Client' : 'Server'
}

function noop () {}
