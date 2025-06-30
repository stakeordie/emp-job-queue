# Mermaid Examples

## Flowchart

<FullscreenDiagram>

```mermaid
graph LR
    A[Start] --> B{Is it?}
    B -- Yes --> C[OK]
    B -- No --> D[Not OK]
```

</FullscreenDiagram>

## Sequence Diagram

<FullscreenDiagram>

```mermaid
sequenceDiagram
    participant Browser
    participant Server
    
    Browser->>Server: GET /api/data
    Server-->>Browser: Return data
    Browser->>Browser: Show data
```

</FullscreenDiagram>

## Class Diagram

<FullscreenDiagram>

```mermaid
classDiagram
    class Animal {
        +name: string
        +age: number
        +makeSound()
    }
    class Dog {
        +breed: string
        +bark()
    }
    Animal <|-- Dog
```

</FullscreenDiagram>

## State Diagram

<FullscreenDiagram>

```mermaid
stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```

</FullscreenDiagram>
