import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atom } from './atom.entity';
import { CreateAtomDto } from './dto/create-atom.dto';

@Injectable()
export class AtomsService {
  constructor(
    @InjectRepository(Atom)
    private atomRepository: Repository<Atom>,
  ) {}

  async create(createAtomDto: CreateAtomDto): Promise<Atom> {
    // Generate next atom ID
    const latestAtom = await this.atomRepository.findOne({
      where: {},
      order: { atomId: 'DESC' },
    });

    const nextId = latestAtom ? parseInt(latestAtom.atomId.split('-')[1]) + 1 : 1;
    const atomId = `IA-${String(nextId).padStart(3, '0')}`;

    // Create atom with draft status
    const atom = this.atomRepository.create({
      atomId,
      ...createAtomDto,
      status: 'draft',
    });

    return this.atomRepository.save(atom);
  }

  async findAll(): Promise<Atom[]> {
    return this.atomRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Atom> {
    const atom = await this.atomRepository.findOne({ where: { id } });
    if (!atom) {
      throw new NotFoundException(`Atom with ID ${id} not found`);
    }
    return atom;
  }

  async findByAtomId(atomId: string): Promise<Atom> {
    const atom = await this.atomRepository.findOne({ where: { atomId } });
    if (!atom) {
      throw new NotFoundException(`Atom with ID ${atomId} not found`);
    }
    return atom;
  }

  async commit(id: string): Promise<Atom> {
    const atom = await this.findOne(id);

    if (atom.status === 'committed') {
      throw new Error('Atom is already committed');
    }

    atom.status = 'committed';
    atom.committedAt = new Date();

    return this.atomRepository.save(atom);
  }

  async supersede(id: string, newAtomId: string): Promise<Atom> {
    const atom = await this.findOne(id);

    atom.status = 'superseded';
    atom.supersededBy = newAtomId;

    return this.atomRepository.save(atom);
  }
}
