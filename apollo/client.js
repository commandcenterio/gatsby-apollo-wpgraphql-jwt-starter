import { ApolloClient, ApolloLink, InMemoryCache, from } from "@apollo/client"
import { TokenRefreshLink } from "apollo-link-token-refresh"
import { onError } from "apollo-link-error"
import { BatchHttpLink } from "@apollo/link-batch-http"
import fetch from "isomorphic-fetch"

import possibleTypes from "./possibleTypes.json"
import { getUuid } from "../src/services/utilities"
import {
  getAuthToken,
  isTokenExpired,
  getRefreshToken,
  setAuthToken,
  deleteJwt,
  logout,
} from "../src/services/auth"
import { navigate } from "gatsby"


const batchHttpLink = new BatchHttpLink({
  uri: process.env.GRAPHQL_URL,
  fetch,
  batchMax: 100,
  batchInterval: 10,
})

const authMiddleware = new ApolloLink((operation, forward) => {
  // get the authentication token from local storage if it exists
  const token = getAuthToken()
  if (token) {
    operation.setContext({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  }
  return forward(operation)
})

const refreshTokenLink = new TokenRefreshLink({
  accessTokenField: `refreshJwtAuthToken`,
  isTokenValidOrUndefined: () => {
    const token = getAuthToken()
    return !token || (token && !isTokenExpired(token))
  },
  fetchAccessToken: () => {
    const query = `
          mutation RefreshJWTAuthToken($input: RefreshJwtAuthTokenInput!) {
            refreshJwtAuthToken(input: $input) {
              authToken
            }
          }
        `
    return fetch(process.env.GRAPHQL_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            jwtRefreshToken: getRefreshToken(),
            clientMutationId: getUuid(),
          },
        },
      }),
    })
  },
  handleFetch: response => {
    if (response.errors && response.errors.length) return
    console.log("HandleFetch", response)
    setAuthToken(response.authToken)
  },
  // handleResponse: (operation, accessTokenField) => response => {
  // },
  handleError: err => {
    console.error(err)
    deleteJwt()
  },
})

const onErrorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path, extensions }) => {
      if (extensions.code === "invalid-jwt") {
        logout(() => navigate("/login/"))
      }
      console.log(`[GraphQL error]:`, `Message: ${message}, Location: ${locations}, Path: ${path}, Extension: ${extensions}`)
    })
  }

  if (networkError) {
    console.log(`[Network error]: ${networkError}`)
  }
})

export const client = new ApolloClient({
  link: from([
    refreshTokenLink,
    authMiddleware,
    onErrorLink,
    batchHttpLink,
  ]),
  cache: new InMemoryCache({ possibleTypes }),
})