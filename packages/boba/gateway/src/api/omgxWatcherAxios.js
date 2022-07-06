import axios from 'axios'
import { getNetwork } from 'util/masterConfig'
const nw = getNetwork()

export default function omgxWatcherAxiosInstance(networkGateway){

  let axiosInstance = null

  if(networkGateway === 'local') {
    return null //does not make sense on local
  }
  else {
    if(nw[networkGateway].OMGX_WATCHER_URL === null) return
    axiosInstance = axios.create({
      baseURL: nw[networkGateway].OMGX_WATCHER_URL,
    })
  }

  axiosInstance.interceptors.request.use((config) => {
    config.headers['Accept'] = 'application/json'
    config.headers['Content-Type'] = 'application/json'
    return config
  })

  return axiosInstance
}
