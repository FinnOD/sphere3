import { BufferAttribute, BufferGeometry } from 'three';

export interface SerializedBufferGeometry {
	index: number[] | null;
	attributes: { [name: string]: TransferableAttribute };
}

export interface TransferableAttribute {
	array: ArrayBuffer;
	itemSize: number;
}

export function serializeBufferGeometry(bufferGeometry: BufferGeometry): SerializedBufferGeometry {
	const { index, attributes } = bufferGeometry;
	const serializedAttributes: { [name: string]: TransferableAttribute } = {};

	for (const attributeName in attributes) {
		const attribute = attributes[attributeName];
		const array = attribute.array.buffer;
		serializedAttributes[attributeName] = {
			array,
			itemSize: attribute.itemSize
		};
	}

	return {
		index: index ? Array.from(index.array) : null,
		attributes: serializedAttributes
	};
}

export function deserializeBufferGeometry(
	serializedData: SerializedBufferGeometry
): BufferGeometry {
	const { index, attributes } = serializedData;
	const bufferGeometry = new BufferGeometry();

	if (index !== null) {
		bufferGeometry.setIndex(new BufferAttribute(new Uint32Array(index), 1));
	}

	for (const attributeName in attributes) {
		const attributeData = attributes[attributeName];
		const array = new Float32Array(attributeData.array);
		const attribute = new BufferAttribute(array, attributeData.itemSize);
		bufferGeometry.setAttribute(attributeName, attribute);
	}

	return bufferGeometry;
}
