/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RestContext, rest } from 'msw';
import { setupServer } from 'msw/node';
import { PluginEndpointDiscovery } from '@backstage/backend-common';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { PermissionIntegrationClient } from './PermissionIntegrationClient';

const server = setupServer();

const mockBaseUrl = 'http://backstage:9191/i-am-a-mock-base';
const discovery: PluginEndpointDiscovery = {
  async getBaseUrl() {
    return mockBaseUrl;
  },
  async getExternalBaseUrl() {
    throw new Error('Not implemented.');
  },
};

const client: PermissionIntegrationClient = new PermissionIntegrationClient({
  discovery,
});

const mockConditions = {
  not: {
    allOf: [
      { rule: 'RULE_1', params: [] },
      { rule: 'RULE_2', params: ['abc'] },
    ],
  },
};

describe('PermissionIntegrationClient', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  describe('applyConditions', () => {
    const mockApplyConditionsHandler = jest.fn(
      (_req, res, { json }: RestContext) => {
        return res(json({ result: AuthorizeResult.ALLOW }));
      },
    );

    beforeEach(() => {
      server.use(
        rest.post(
          `${mockBaseUrl}/permissions/apply-conditions`,
          mockApplyConditionsHandler,
        ),
      );
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should make a POST request to the correct endpoint', async () => {
      await client.applyConditions('testResource1', {
        pluginId: 'test-plugin',
        resourceType: 'test-resource',
        conditions: mockConditions,
      });

      expect(mockApplyConditionsHandler).toHaveBeenCalled();
    });

    it('should include a request body', async () => {
      await client.applyConditions('testResource1', {
        pluginId: 'test-plugin',
        resourceType: 'test-resource',
        conditions: mockConditions,
      });

      expect(mockApplyConditionsHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            resourceRef: 'testResource1',
            resourceType: 'test-resource',
            conditions: mockConditions,
          },
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return the response from the fetch request', async () => {
      const response = await client.applyConditions('testResource1', {
        pluginId: 'test-plugin',
        resourceType: 'test-resource',
        conditions: mockConditions,
      });

      expect(response).toEqual(
        expect.objectContaining({ result: AuthorizeResult.ALLOW }),
      );
    });

    it('should not include authorization headers if no token is supplied', async () => {
      await client.applyConditions('testResource1', {
        pluginId: 'test-plugin',
        resourceType: 'test-resource',
        conditions: mockConditions,
      });

      const request = mockApplyConditionsHandler.mock.calls[0][0];
      expect(request.headers.has('authorization')).toEqual(false);
    });

    it('should include correctly-constructed authorization header if token is supplied', async () => {
      await client.applyConditions(
        'testResource1',
        {
          pluginId: 'test-plugin',
          resourceType: 'test-resource',
          conditions: mockConditions,
        },
        'Bearer fake-token',
      );

      const request = mockApplyConditionsHandler.mock.calls[0][0];
      expect(request.headers.get('authorization')).toEqual('Bearer fake-token');
    });

    it('should forward response errors', async () => {
      mockApplyConditionsHandler.mockImplementationOnce(
        (_req, res, { status }: RestContext) => {
          return res(status(401));
        },
      );

      await expect(
        client.applyConditions('testResource1', {
          pluginId: 'test-plugin',
          resourceType: 'test-resource',
          conditions: mockConditions,
        }),
      ).rejects.toThrowError(/request failed with 401/i);
    });

    it('should reject invalid responses', async () => {
      mockApplyConditionsHandler.mockImplementationOnce(
        (_req, res, { json }: RestContext) => {
          return res(json({ outcome: AuthorizeResult.ALLOW }));
        },
      );

      await expect(
        client.applyConditions('testResource1', {
          pluginId: 'test-plugin',
          resourceType: 'test-resource',
          conditions: mockConditions,
        }),
      ).rejects.toThrowError(/invalid input/i);
    });
  });
});
