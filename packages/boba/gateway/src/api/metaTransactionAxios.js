import axios from 'axios'
import { getBaseServices } from 'util/masterConfig'

export default function metaTransactionAxiosInstance(networkGateway){

  let axiosInstance = null;

  if(networkGateway === 'local') {
    return null //does not make sense on local
  }
  else if (networkGateway === 'bobaBeam') {
    axiosInstance = axios.create({
      baseURL: getBaseServices().BOBABEAM_META_TRANSACTION,
    })
  } 
  else if (networkGateway === 'bobaBase') {
    axiosInstance = axios.create({
      baseURL: getBaseServices().BOBABASE_META_TRANSACTION,
    })
  }

  axiosInstance.interceptors.request.use((config) => {
    config.headers['Accept'] = 'application/json'
    config.headers['Content-Type'] = 'application/json'
    return config
  })

  return axiosInstance
}
