# INSTALLATION:
#  $ docker build -t greup:5000/raptor/r2db_sigfox .
#  $ docker push greup:5000/raptor/r2db_sigfox
# 
#  espel$ docker pull greup:5000/raptor/r2db_sigfox
#  espel$ docker run --env RABBIT_EXCHANGE='' --env RABBIT_CONNECTIONURL='' greup:5000/raptor/r2db_sigfox

FROM    greup:5000/raptor/nodejs-base:latest

COPY . /src
WORKDIR /src


#
# install global node modules
#
RUN npm --registry http://keske.pirod.nl:4873 install -g gulp

#
# install local node modules/libraries
#   make sure python 2.7 and a proper C/C++ compiler toolchain like GCC are available
#   for details see: https://github.com/TooTallNate/node-gyp
#
RUN npm install
RUN npm install oracledb

#
# build application
#    TODO: probably better to run 'gulp' or 'gulp compile' instead:
#      gulp:         build and test application
#      gulp compile: compile only (no tests executed)
#
RUN node install


#
# Rabbitmq settings
#
ENV RABBIT_CONNECTIONURL rabbitmq

# define the RABBIT_QUEUE env variable to use the specified queue as source, if defined, RABBIT_EXCHANGE is ignored
# ENV RABBIT_QUEUE koppelvlak.queue.tap.nassau

# define the RABBIT_EXCHANGE env variable to create a private queue for the specified exchange as source
ENV RABBIT_EXCHANGE koppelvlak.exchange.ais.tap.nassau


#
# Oracle settings
#
ENV ORACLE_CONNECTSTRING 172.16.128.43:1521/ORCL
ENV ORACLE_USER hr
ENV ORACLE_PASSWORD hr


CMD ["node", "app.js"]
