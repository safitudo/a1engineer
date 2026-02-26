export const config = {
  host: process.env.IRC_HOST || 'localhost',
  port: parseInt(process.env.IRC_PORT || '6667'),
  nick: process.env.IRC_NICK || `${process.env.CITY || 'agent'}-${process.env.IRC_ROLE || 'dev'}`,
  channels: (process.env.IRC_CHANNELS || '#main,#tasks,#code,#testing,#merges').split(','),
}
