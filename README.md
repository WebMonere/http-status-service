[![Build Status](https://travis-ci.com/WebMonere/http-status-service.svg?branch=master)](https://travis-ci.com/WebMonere/http-status-service)

"# http-status-service" 

## Dependencies
To Run Rethink db service

### Database Server 
docker run --mount source=vol,target=/data/rethinkdb_data  -p 8080:8080 -p 28015:28105 -p 29015:29015 rethinkdb

### Node App 
docker run  -e DBHOST='localhost' -p 80:3000 c0bb483cb161