import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_SEARCH_LENGTH, MIN_SEARCH_LENGTH } from '../../../application/search-agenda';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Parámetros de consulta de `GET /search`. */
export class SearchQueryDto {
  @ApiProperty({
    minLength: MIN_SEARCH_LENGTH,
    maxLength: MAX_SEARCH_LENGTH,
    example: 'maria',
    description: `Texto a buscar, recortado, de ${MIN_SEARCH_LENGTH} a ${MAX_SEARCH_LENGTH} caracteres. No distingue acentos ni mayúsculas.`,
  })
  @Transform(trim)
  @IsString({ message: 'q debe ser texto' })
  @MinLength(MIN_SEARCH_LENGTH, {
    message: `q debe tener al menos ${MIN_SEARCH_LENGTH} caracteres`,
  })
  @MaxLength(MAX_SEARCH_LENGTH, {
    message: `q admite hasta ${MAX_SEARCH_LENGTH} caracteres`,
  })
  q!: string;
}
