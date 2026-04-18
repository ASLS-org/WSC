import WSCServer from './server';

export * from './peer';

const server = new WSCServer();
server.listen();
