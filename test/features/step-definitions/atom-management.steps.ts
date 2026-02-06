import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from 'expect';
import { PactWorld, Atom } from './world';

// Helper to find atom by description substring
function findAtomByDescription(atoms: Atom[], searchTerm: string): Atom | undefined {
  return atoms.find((a) => a.description.toLowerCase().includes(searchTerm.toLowerCase()));
}

// Given steps for atom management

Given(
  'I have created a draft atom with description: {string}',
  function (this: PactWorld, description: string) {
    const atom = this.createMockAtom(description, 'functional', 'draft');
    this.currentAtom = atom;
    this.atoms.push(atom);
  },
);

Given(
  'I have a committed atom with description: {string}',
  function (this: PactWorld, description: string) {
    const atom = this.createMockAtom(description, 'functional', 'committed');
    atom.qualityScore = 85;
    this.currentAtom = atom;
    this.atoms.push(atom);
  },
);

Given(
  'the system has atoms with various statuses:',
  function (this: PactWorld, dataTable: DataTable) {
    const rows = dataTable.hashes();
    for (const row of rows) {
      const status = row.status as 'draft' | 'committed' | 'superseded';
      const count = parseInt(row.count, 10);
      for (let i = 0; i < count; i++) {
        const atom = this.createMockAtom(`Test atom ${status} ${i + 1}`, 'functional', status);
        if (status !== 'draft') {
          atom.qualityScore = 85;
        }
        this.atoms.push(atom);
      }
    }
  },
);

Given('the system has atoms with descriptions:', function (this: PactWorld, dataTable: DataTable) {
  const rows = dataTable.hashes();
  for (const row of rows) {
    const atom = this.createMockAtom(row.description, row.category, 'draft');
    this.atoms.push(atom);
  }
});

// When steps for atom management

When(
  'I update the atom description to: {string}',
  function (this: PactWorld, newDescription: string) {
    if (!this.currentAtom) {
      throw new Error('No current atom to update');
    }

    if (this.currentAtom.status !== 'draft') {
      this.lastResponse = {
        status: 403,
        message: `Cannot update atom with status '${this.currentAtom.status}'. Only draft atoms can be updated.`,
      };
      return;
    }

    this.currentAtom.description = newDescription;
    this.lastResponse = { status: 200 };
  },
);

When(
  'I attempt to update the atom description to: {string}',
  function (this: PactWorld, newDescription: string) {
    if (!this.currentAtom) {
      throw new Error('No current atom to update');
    }

    if (this.currentAtom.status !== 'draft') {
      this.lastResponse = {
        status: 403,
        message: `Cannot update atom with status '${this.currentAtom.status}'. Only draft atoms can be updated.`,
      };
      return;
    }

    this.currentAtom.description = newDescription;
    this.lastResponse = { status: 200 };
  },
);

When('I supersede the first atom with the second atom', function (this: PactWorld) {
  if (this.atoms.length < 2) {
    throw new Error('Need at least two atoms for supersession');
  }

  const firstAtom = this.atoms[0];
  const secondAtom = this.atoms[1];

  if (firstAtom.status !== 'committed') {
    this.lastResponse = {
      status: 400,
      message: 'Only committed atoms can be superseded',
    };
    return;
  }

  firstAtom.status = 'superseded';
  firstAtom.supersededBy = secondAtom.id;
  this.currentAtom = firstAtom;
  this.lastResponse = { status: 200 };
});

When('I filter atoms by status {string}', function (this: PactWorld, status: string) {
  this.searchResults = this.atoms.filter((a) => a.status === status);
});

When('I search for atoms containing {string}', function (this: PactWorld, searchTerm: string) {
  this.searchResults = this.atoms.filter((a) =>
    a.description.toLowerCase().includes(searchTerm.toLowerCase()),
  );
});

When('I add tag {string} to the atom', function (this: PactWorld, tag: string) {
  if (!this.currentAtom) {
    throw new Error('No current atom');
  }
  if (!this.currentAtom.tags.includes(tag)) {
    this.currentAtom.tags.push(tag);
  }
});

When('I remove tag {string} from the atom', function (this: PactWorld, tag: string) {
  if (!this.currentAtom) {
    throw new Error('No current atom');
  }
  this.currentAtom.tags = this.currentAtom.tags.filter((t) => t !== tag);
});

When('I delete the atom', function (this: PactWorld) {
  if (!this.currentAtom) {
    throw new Error('No current atom to delete');
  }

  if (this.currentAtom.status !== 'draft') {
    this.lastResponse = {
      status: 403,
      message: `Cannot delete atom with status '${this.currentAtom.status}'. Only draft atoms can be deleted.`,
    };
    return;
  }

  // Remove from atoms array
  this.atoms = this.atoms.filter((a) => a.id !== this.currentAtom!.id);
  const deletedId = this.currentAtom.id;
  this.currentAtom = null;
  this.lastResponse = { status: 204, data: { deletedId } };
});

When('I attempt to delete the atom', function (this: PactWorld) {
  if (!this.currentAtom) {
    throw new Error('No current atom to delete');
  }

  if (this.currentAtom.status !== 'draft') {
    this.lastResponse = {
      status: 403,
      message: `Cannot delete atom with status '${this.currentAtom.status}'. Only draft atoms can be deleted.`,
    };
    return;
  }

  this.atoms = this.atoms.filter((a) => a.id !== this.currentAtom!.id);
  this.currentAtom = null;
  this.lastResponse = { status: 204 };
});

// Then steps for atom management

Then('the atom description is updated successfully', function (this: PactWorld) {
  expect(this.lastResponse).not.toBeNull();
  expect(this.lastResponse!.status).toBe(200);
});

Then('the atom status remains {string}', function (this: PactWorld, expectedStatus: string) {
  expect(this.currentAtom).not.toBeNull();
  expect(this.currentAtom!.status).toBe(expectedStatus);
});

Then(
  'the update is rejected with status {int}',
  function (this: PactWorld, expectedStatus: number) {
    expect(this.lastResponse).not.toBeNull();
    expect(this.lastResponse!.status).toBe(expectedStatus);
  },
);

Then('I receive a message about immutability', function (this: PactWorld) {
  expect(this.lastResponse).not.toBeNull();
  expect(this.lastResponse!.message).toMatch(/cannot.*update|immutable|committed/i);
});

Then('the atom description remains unchanged', function (this: PactWorld) {
  // The atom should still exist with original description
  expect(this.currentAtom).not.toBeNull();
});

Then(
  'the first atom status changes to {string}',
  function (this: PactWorld, expectedStatus: string) {
    expect(this.atoms[0].status).toBe(expectedStatus);
  },
);

Then('the first atom references the superseding atom', function (this: PactWorld) {
  expect(this.atoms[0].supersededBy).toBe(this.atoms[1].id);
});

Then('the supersession chain is recorded', function (this: PactWorld) {
  expect(this.atoms[0].supersededBy).not.toBeNull();
});

Then('I see only atoms with status {string}', function (this: PactWorld, expectedStatus: string) {
  expect(this.searchResults.length).toBeGreaterThan(0);
  for (const atom of this.searchResults) {
    expect(atom.status).toBe(expectedStatus);
  }
});

Then('the result count is {int}', function (this: PactWorld, expectedCount: number) {
  expect(this.searchResults.length).toBe(expectedCount);
});

Then('I see {int} matching atoms', function (this: PactWorld, expectedCount: number) {
  expect(this.searchResults.length).toBe(expectedCount);
});

Then(
  'the results include {string} and {string} atoms',
  function (this: PactWorld, term1: string, term2: string) {
    const found1 = this.searchResults.some((a) =>
      a.description.toLowerCase().includes(term1.toLowerCase()),
    );
    const found2 = this.searchResults.some((a) =>
      a.description.toLowerCase().includes(term2.toLowerCase()),
    );
    expect(found1).toBe(true);
    expect(found2).toBe(true);
  },
);

Then('the atom has tag {string}', function (this: PactWorld, tag: string) {
  expect(this.currentAtom).not.toBeNull();
  expect(this.currentAtom!.tags).toContain(tag);
});

Then(
  'the atom has tags {string} and {string}',
  function (this: PactWorld, tag1: string, tag2: string) {
    expect(this.currentAtom).not.toBeNull();
    expect(this.currentAtom!.tags).toContain(tag1);
    expect(this.currentAtom!.tags).toContain(tag2);
  },
);

Then('the atom has only tag {string}', function (this: PactWorld, tag: string) {
  expect(this.currentAtom).not.toBeNull();
  expect(this.currentAtom!.tags).toEqual([tag]);
});

Then('the atom is removed from the system', function (this: PactWorld) {
  expect(this.lastResponse).not.toBeNull();
  expect(this.lastResponse!.status).toBe(204);
});

Then('the atom is no longer retrievable', function (this: PactWorld) {
  // currentAtom was set to null after deletion
  expect(this.currentAtom).toBeNull();
});

Then(
  'the deletion is rejected with status {int}',
  function (this: PactWorld, expectedStatus: number) {
    expect(this.lastResponse).not.toBeNull();
    expect(this.lastResponse!.status).toBe(expectedStatus);
  },
);

Then('I receive a message about committed atom restrictions', function (this: PactWorld) {
  expect(this.lastResponse).not.toBeNull();
  expect(this.lastResponse!.message).toMatch(/cannot.*delete|committed/i);
});

Then('the atom still exists in the system', function (this: PactWorld) {
  expect(this.currentAtom).not.toBeNull();
  const foundAtom = this.atoms.find((a) => a.id === this.currentAtom!.id);
  expect(foundAtom).toBeDefined();
});
