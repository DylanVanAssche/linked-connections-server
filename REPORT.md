# The influence of separating live and static data

## Introduction

Linked Connections is a project to provide public transport data as Linked Open Data.
Right now, Linked Connections combines live data with the static data on the server side. This takes sometimes a lot of time due the fact that the server needs to match the static fragments with the live fragments when the live data received a lot of updates over time. This happens every time a client requests a new fragment or when
the live data in a certain fragment is updated and the client wants an update of that
fragment.

This report will take a look at separating both resources and let the client handle the merging to provide a faster routing and make it easier to cache the static fragments for a longer time, even with the live data changes.

## Hypotheses

- Is the response time of the server significant faster when both resources are separated?

- Is it easy for the clients to combine these data resources themselves?

## Implementation

In order to test this hypotheses, we modified the `page-finder.js` router in the `linked-connection-server`. We removed the data aggregation of the live and static data
functions to speed up the response time. Both data resources are now available under the following URIs:
- The static fragments are served under: `/company/connections/static?departureTime={ISO-date}`
- The live data is available at: `company/connections/live?departureTime={ISO-date}`

## Results

To compare if we actually have a faster response time, we compared our changes
to the `irail` branch of the `linked-connections-server` since we have live data
available from the SNCB/NMBS.

### Environment

- Intel i3 Core 530 @ 2,93 Ghz
- 8 GB DDR3 RAM
- Sandisk SSD 120 GB (SDSSDP12)
- Firefox 60.2 ESR 64 bit (caching disabled)
- OpenSUSE Leap 15

### Benchmarks

In the following table we can see the response time of the server with caching disabled for both implementations:

| static resource (ms) | live resource (ms) | combined resource (ms) |
| -------------------- | ------------------ | ---------------------- |
| 29                   | 16                 | 41                     |    
| 24                   | 25                 | 48                     |    
| 34                   | 21                 | 57                     |    
| 41                   | 16                 | 51                     |    
| 30                   | 25                 | 52                     |    
| 30                   | 20                 | 53                     |    
| 29                   | 28                 | 61                     |    
| 27                   | 18                 | 67                     |    
| 21                   | 19                 | 42                     |    
| 28                   | 24                 | 43                     |    
| 66                   | 27                 | 43                     |    
| 23                   | 18                 | 43                     |    
| 29                   | 19                 | 43                     |    
| 36                   | 21                 | 42                     |    
| 36                   | 17                 | 35                     |    
| 29                   | 17                 | 67                     |    
| 24                   | 21                 | 43                     |    
| 25                   | 18                 | 46                     |    
| 24                   | 20                 | 41                     |    
| 24                   | 20                 | 41                     |    
| 21                   | 43                 | 39                     |    
| 20                   | 39                 | 35                     |    
| 25                   | 16                 | 59                     |    
| 24                   | 18                 | 76                     |    
| 38                   | 21                 | 60                     |  


#### Static resource

| median (ms) | max (ms) | min (ms) |
| ----------- | -------- | -------- |
| 28          | 66       | 20       |   

#### Live resource

| median (ms) | max (ms) | min (ms) |
| ----------- | -------- | -------- |
| 20          | 43       | 16       |  

#### Combined resource

| median (ms) | max (ms) | min (ms) |
| ----------- | -------- | -------- |
| 43          | 76       | 35       |  

## Conclusion

By splitting the static and live data resources we can reduce the response time of each resource by approximately 50 %. Due a faster response time of the static fragments we can faster route on the client side without real time information.
This way, we can completely cache the static data on the client side for at least a whole day. The client only has to request the real time data resource when it wants to run a routing algorithm to get the latest information about the fragments when it has already the static fragments in cache.

The downside of this approach is that the client needs to fetch 2 different data resources and combine them locally which requires more effort on the client side.

## Future work

Using the latest HTTP developments (HTTP/2 push) we can easily push the live data to the client in order to speed up the fetching process. Using HTTP/2 push the client can
request the server to automatically push the live data together with the static data when the client is requesting the static data. The clients still has to combine the data resources themselves, but no extra HTTP request is needed (loads from the push cache).
